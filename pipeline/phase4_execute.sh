#!/usr/bin/env bash
# Phase 4: Execute benchmark (resumable, parallel per provider)
# Sourced by run.sh — REPO_ROOT, RUN_DIR, CI_MODE, RESUME, etc. are already set.

TJ_BIN=$(get_thoughtjack_bin)
RUNS_PER=$(get_config_value '.run.runs_per_scenario')
MAX_SESSION=$(get_config_value '.run.max_session')
MAX_TURNS=$(get_config_value '.run.max_turns')
CONTEXT_TIMEOUT=$(get_config_value '.run.context_timeout')

# Counters
TOTAL_EXPECTED=0
COMPLETED=0
SKIPPED=0
ERRORS=0
INCONCLUSIVES=0
RUN_COUNTER=0

# Parallel job tracking
JOB_STATUS_DIR=$(mktemp -d)
ACTIVE_PIDS=""
EXPECTED_JOBS=""  # track job_ids we launched

# Cleanup on exit or interrupt: kill background jobs, remove temp dir
_phase4_cleanup() {
  for pid in $ACTIVE_PIDS; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  rm -rf "$JOB_STATUS_DIR"
}
trap _phase4_cleanup EXIT INT TERM

# Compute total expected runs
MODEL_COUNT=$(get_model_count)
ATTACK_COUNT=$(get_attack_scenario_count)
UTILITY_COUNT=$(get_utility_scenario_count)
TOTAL_EXPECTED=$(( (ATTACK_COUNT + UTILITY_COUNT) * MODEL_COUNT * RUNS_PER ))

# --- Check if a run is already complete ---
is_run_complete() {
  local results_dir="$1" model_id="$2" scenario_id="$3" run_num="$4"
  local base="$results_dir/$model_id/${scenario_id}_run${run_num}"

  if [[ -f "${base}.json" ]]; then return 0; fi
  if [[ -f "${base}.INCONCLUSIVE.json" ]]; then return 0; fi
  if [[ -f "${base}.ERROR.json" ]]; then
    if [[ "$NO_RETRY_ERRORS" == true ]]; then return 0; fi
    rm -f "${base}.ERROR.json"
    return 1
  fi
  return 1
}

# --- Single run (called as background job via run_one_job) ---
# This script is eval'd with all variables pre-expanded so it works in a subshell.
run_one_job() {
  # Disable errexit — this function handles errors manually via exit codes.
  # Background subshells inherit set -e from the parent, which would silently
  # kill the job on any non-zero command.
  set +e

  local scenario_yaml="$1" output_path="$2" status_file="$3"
  local model_id="$4" scenario_id="$5" run_num="$6"
  local trace_path="${output_path%.json}.trace.jsonl"

  mkdir -p "$(dirname "$output_path")"

  local start_time=$SECONDS
  local exit_code=0

  # shellcheck disable=SC2086
  "$TJ_BIN" run \
    --config "$scenario_yaml" \
    --context \
    $_TJ_CONTEXT_ARGS \
    --context-api-key "$_TJ_API_KEY" \
    --context-temperature "$_TJ_TEMPERATURE" \
    --max-session "$MAX_SESSION" \
    --max-turns "$MAX_TURNS" \
    --context-timeout "$CONTEXT_TIMEOUT" \
    --no-semantic \
    --export-trace "$trace_path" \
    -o "$output_path" 2>/dev/null || exit_code=$?

  local elapsed=$(( SECONDS - start_time ))
  local status="COMPLETED"
  local tier_str="UNKNOWN"

  if [[ "$exit_code" -ge 0 && "$exit_code" -le 4 ]]; then
    if [[ ! -f "$output_path" ]]; then
      jq -n --arg error "No output file produced (exit $exit_code)" --argjson exit_code "$exit_code" \
        --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '{error: $error, exit_code: $exit_code, timestamp: $timestamp}' \
        > "${output_path%.json}.ERROR.json" 2>/dev/null
      rm -f "$trace_path"
      status="ERROR"; tier_str="ERROR"
    else
      local trace_msgs
      trace_msgs=$(jq -r '.execution_summary.trace_messages // 0' "$output_path" 2>/dev/null || echo "0")
      if [[ "$trace_msgs" -eq 0 ]]; then
        mv "$output_path" "${output_path%.json}.INCONCLUSIVE.json"
        [[ -f "$trace_path" ]] && mv "$trace_path" "${output_path%.json}.INCONCLUSIVE.trace.jsonl"
        status="INCONCLUSIVE"; tier_str="INCONCLUSIVE"
      else
        tier_str=$(tier_to_string "$(exit_code_to_tier "$exit_code")")
      fi
    fi
  else
    # Write ERROR file (no retry in parallel mode — retries add unpredictable delays)
    jq -n --arg error "Exit code $exit_code" --argjson exit_code "$exit_code" \
      --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      '{error: $error, exit_code: $exit_code, timestamp: $timestamp}' \
      > "${output_path%.json}.ERROR.json" 2>/dev/null
    rm -f "$output_path" "$trace_path"
    status="ERROR"; tier_str="ERROR"
  fi

  echo "$status $tier_str $elapsed $model_id $scenario_id $run_num" > "$status_file"
}

# --- Wait until fewer than max_parallel jobs are running ---
wait_for_slot() {
  local max_par="$1"
  while true; do
    local new_pids="" count=0
    for pid in $ACTIVE_PIDS; do
      if kill -0 "$pid" 2>/dev/null; then
        new_pids="$new_pids $pid"
        count=$((count + 1))
      else
        wait "$pid" 2>/dev/null || true
      fi
    done
    ACTIVE_PIDS="$new_pids"
    if [[ "$count" -lt "$max_par" ]]; then break; fi
    sleep 0.3
  done
}

# --- Wait for all active jobs ---
wait_all() {
  for pid in $ACTIVE_PIDS; do
    wait "$pid" 2>/dev/null || true
  done
  ACTIVE_PIDS=""
}

# --- Collect finished job results from status files ---
collect_results() {
  for sf in "$JOB_STATUS_DIR"/*; do
    [[ -f "$sf" ]] || continue
    [[ "$sf" == *.collected ]] && continue
    local line status tier_str elapsed model_id scenario_id run_num
    line=$(cat "$sf")
    read -r status tier_str elapsed model_id scenario_id run_num <<< "$line"

    case "$status" in
      COMPLETED) COMPLETED=$((COMPLETED + 1)) ;;
      ERROR) ERRORS=$((ERRORS + 1)) ;;
      INCONCLUSIVE) INCONCLUSIVES=$((INCONCLUSIVES + 1)) ;;
    esac

    RUN_COUNTER=$((RUN_COUNTER + 1))
    printf "[%d/%d] %s × %s run %d: %s (%ds)\n" \
      "$RUN_COUNTER" "$TOTAL_EXPECTED" "$model_id" "$scenario_id" "$run_num" "$tier_str" "$elapsed"

    # Mark as collected so we can detect crashed jobs
    local base_name
    base_name=$(basename "$sf")
    touch "$JOB_STATUS_DIR/${base_name}.collected"
    rm -f "$sf"
  done
}

write_progress() {
  local elapsed=$SECONDS
  local rate=0
  local done_count=$((COMPLETED + ERRORS + INCONCLUSIVES + SKIPPED))
  if [[ "$elapsed" -gt 0 && "$done_count" -gt 0 ]]; then
    local remaining=$((TOTAL_EXPECTED - done_count))
    rate=$(( elapsed * remaining / done_count ))
  fi
  jq -n \
    --argjson total "$TOTAL_EXPECTED" --argjson completed "$COMPLETED" \
    --argjson errors "$ERRORS" --argjson inconclusive "$INCONCLUSIVES" \
    --argjson skipped "$SKIPPED" --argjson elapsed "$elapsed" \
    --argjson est_remaining "$rate" \
    '{total_expected:$total,completed:$completed,errors:$errors,
      inconclusive:$inconclusive,skipped:$skipped,
      elapsed_seconds:$elapsed,estimated_remaining_seconds:$est_remaining}' \
    > "$RUN_DIR/progress.json"
}

# --- Build scenario ID lists ---
ATTACK_IDS_STR="$(get_attack_scenario_ids)"
UTILITY_IDS_STR="$(get_utility_scenario_ids)"

if [[ -n "${SCENARIO_FILTER:-}" ]]; then
  ATTACK_IDS_STR="$(echo "$ATTACK_IDS_STR" | grep "^${SCENARIO_FILTER}$" || true)"
  UTILITY_IDS_STR="$(echo "$UTILITY_IDS_STR" | grep "^${SCENARIO_FILTER}$" || true)"
  ATTACK_FILTERED=0
  UTILITY_FILTERED=0
  [[ -n "$ATTACK_IDS_STR" ]] && ATTACK_FILTERED=$(echo "$ATTACK_IDS_STR" | wc -l | tr -d ' ')
  [[ -n "$UTILITY_IDS_STR" ]] && UTILITY_FILTERED=$(echo "$UTILITY_IDS_STR" | wc -l | tr -d ' ')
  TOTAL_EXPECTED=$(( (ATTACK_FILTERED + UTILITY_FILTERED) * MODEL_COUNT * RUNS_PER ))
fi

log "Expected total runs: $TOTAL_EXPECTED ($MODEL_COUNT models × $RUNS_PER runs)"

# --- Main loop: model-outer ---
LAST_PROVIDER=""

for idx in $(get_model_indices); do
  model_id=$(get_model_field "$idx" ".id")
  model_type=$(get_model_field "$idx" ".type")
  provider=$(get_model_field "$idx" ".provider")
  api_key_env=$(get_model_field "$idx" ".api_key_env")

  # Set these as shell variables that background jobs inherit (not function params)
  _TJ_CONTEXT_ARGS=$(get_model_field "$idx" ".context_args")
  _TJ_API_KEY=$(resolve_api_key "$api_key_env")
  _TJ_TEMPERATURE=$(get_temperature "$model_type")

  max_parallel=$(get_rate_limit "$provider" "max_parallel")
  inter_run_delay=$(get_rate_limit "$provider" "inter_run_delay_ms")
  inter_model_delay=$(get_rate_limit "$provider" "inter_model_delay_ms")
  [[ -z "$max_parallel" || "$max_parallel" == "null" ]] && max_parallel=1

  if [[ "$provider" == "$LAST_PROVIDER" ]]; then
    sleep_ms "$inter_model_delay"
  fi
  LAST_PROVIDER="$provider"

  log "Starting model: $model_id ($provider, ${max_parallel}x parallel)"

  # --- Dispatch attack scenarios ---
  if [[ -n "$ATTACK_IDS_STR" ]]; then
    while IFS= read -r scenario_id; do
      [[ -z "$scenario_id" ]] && continue
      for run_num in $(seq 1 "$RUNS_PER"); do
        if is_run_complete "$RUN_DIR/results" "$model_id" "$scenario_id" "$run_num"; then
          SKIPPED=$((SKIPPED + 1))
          RUN_COUNTER=$((RUN_COUNTER + 1))
          continue
        fi

        wait_for_slot "$max_parallel"
        collect_results

        output_path="$RUN_DIR/results/$model_id/${scenario_id}_run${run_num}.json"
        job_id="${model_id}_${scenario_id}_run${run_num}"
        EXPECTED_JOBS="$EXPECTED_JOBS $job_id"

        run_one_job \
          "$RUN_DIR/scenarios/${scenario_id}.yaml" \
          "$output_path" \
          "$JOB_STATUS_DIR/$job_id" \
          "$model_id" "$scenario_id" "$run_num" &
        ACTIVE_PIDS="$ACTIVE_PIDS $!"

        sleep_ms "$inter_run_delay"
      done
    done <<< "$ATTACK_IDS_STR"
  fi

  # --- Dispatch utility scenarios ---
  if [[ -n "$UTILITY_IDS_STR" ]]; then
    while IFS= read -r scenario_id; do
      [[ -z "$scenario_id" ]] && continue
      for run_num in $(seq 1 "$RUNS_PER"); do
        if is_run_complete "$RUN_DIR/utility-results" "$model_id" "$scenario_id" "$run_num"; then
          SKIPPED=$((SKIPPED + 1))
          RUN_COUNTER=$((RUN_COUNTER + 1))
          continue
        fi

        wait_for_slot "$max_parallel"
        collect_results

        output_path="$RUN_DIR/utility-results/$model_id/${scenario_id}_run${run_num}.json"
        job_id="${model_id}_${scenario_id}_run${run_num}"
        EXPECTED_JOBS="$EXPECTED_JOBS $job_id"

        run_one_job \
          "$RUN_DIR/utility/${scenario_id}.yaml" \
          "$output_path" \
          "$JOB_STATUS_DIR/$job_id" \
          "$model_id" "$scenario_id" "$run_num" &
        ACTIVE_PIDS="$ACTIVE_PIDS $!"

        sleep_ms "$inter_run_delay"
      done
    done <<< "$UTILITY_IDS_STR"
  fi

  # Wait for all jobs for this model before moving to next
  wait_all
  collect_results

  # Check for jobs that crashed without writing a status file
  for job_id in $EXPECTED_JOBS; do
    if [[ ! -f "$JOB_STATUS_DIR/${job_id}.collected" ]]; then
      warn "Job $job_id produced no status (likely crashed)"
      ERRORS=$((ERRORS + 1))
      RUN_COUNTER=$((RUN_COUNTER + 1))
      # Parse job_id back to components for logging
      printf "[%d/%d] %s: CRASHED (no status)\n" "$RUN_COUNTER" "$TOTAL_EXPECTED" "$job_id"
    fi
  done
  EXPECTED_JOBS=""

  log "Completed model: $model_id"
done

collect_results
write_progress

log "Phase 4 complete: $COMPLETED succeeded, $ERRORS errors, $INCONCLUSIVES inconclusive, $SKIPPED skipped"
