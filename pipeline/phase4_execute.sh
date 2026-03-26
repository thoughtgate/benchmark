#!/usr/bin/env bash
# Phase 4: Execute benchmark (resumable)
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

# Compute total expected runs
MODEL_COUNT=$(get_model_count)
ATTACK_COUNT=$(get_attack_scenario_count)
UTILITY_COUNT=$(get_utility_scenario_count)
TOTAL_EXPECTED=$(( (ATTACK_COUNT + UTILITY_COUNT) * MODEL_COUNT * RUNS_PER ))

# --- Helper: check if a run is already complete ---
is_run_complete() {
  local results_dir="$1" model_id="$2" scenario_id="$3" run_num="$4"
  local base="$results_dir/$model_id/${scenario_id}_run${run_num}"

  # Success file exists → skip
  if [[ -f "${base}.json" ]]; then
    return 0
  fi

  # Inconclusive → skip
  if [[ -f "${base}.INCONCLUSIVE.json" ]]; then
    return 0
  fi

  # Error file → retry unless --no-retry-errors
  if [[ -f "${base}.ERROR.json" ]]; then
    if [[ "$NO_RETRY_ERRORS" == true ]]; then
      return 0
    fi
    # Delete error file for retry
    rm -f "${base}.ERROR.json"
    return 1
  fi

  return 1
}

# --- Helper: execute a single run ---
execute_run() {
  local model_id="$1" scenario_id="$2" run_num="$3"
  local scenario_yaml="$4" output_dir="$5"
  local context_args="$6" api_key="$7" temperature="$8"
  local provider="$9"

  local output_path="$output_dir/$model_id/${scenario_id}_run${run_num}.json"
  mkdir -p "$output_dir/$model_id"

  local start_time=$SECONDS
  local exit_code=0
  local tier_str="UNKNOWN"
  local stderr_file
  stderr_file=$(mktemp)
  trap 'rm -f "$stderr_file"' RETURN

  # Run ThoughtJack
  # shellcheck disable=SC2086
  "$TJ_BIN" run \
    --config "$scenario_yaml" \
    --context \
    $context_args \
    --context-api-key "$api_key" \
    --context-temperature "$temperature" \
    --max-session "$MAX_SESSION" \
    --max-turns "$MAX_TURNS" \
    --context-timeout "$CONTEXT_TIMEOUT" \
    --no-semantic \
    -o "$output_path" 2>"$stderr_file" || exit_code=$?

  local elapsed=$(( SECONDS - start_time ))
  local stderr_content
  stderr_content=$(cat "$stderr_file" 2>/dev/null || true)

  # Handle result
  if [[ "$exit_code" -ge 0 && "$exit_code" -le 4 ]]; then
    # Success range (0=T0, 1=T1, 2=T2, 3=T3, 4=partial)
    if [[ ! -f "$output_path" ]]; then
      write_error_file "$output_path" "No output file produced" "$exit_code"
      ERRORS=$((ERRORS + 1))
      return
    fi

    # Empty-event guard
    local trace_msgs
    trace_msgs=$(jq -r '.execution_summary.trace_messages // 0' "$output_path" 2>/dev/null || echo "0")
    if [[ "$trace_msgs" -eq 0 ]]; then
      local inconclusive_path="${output_path%.json}.INCONCLUSIVE.json"
      mv "$output_path" "$inconclusive_path"
      INCONCLUSIVES=$((INCONCLUSIVES + 1))
      tier_str="INCONCLUSIVE"
    else
      COMPLETED=$((COMPLETED + 1))
      tier_str=$(tier_to_string "$(exit_code_to_tier "$exit_code")")
    fi

  elif is_retryable_error "$exit_code"; then
    # Retry logic: wait 60s → retry → wait 120s → retry → ERROR
    local retried=false
    for wait_time in 60 120; do
      warn "Retryable error (exit $exit_code) on $model_id × $scenario_id run $run_num. Waiting ${wait_time}s..."
      sleep "$wait_time"

      exit_code=0
      # shellcheck disable=SC2086
      "$TJ_BIN" run \
        --config "$scenario_yaml" \
        --context \
        $context_args \
        --context-api-key "$api_key" \
        --context-temperature "$temperature" \
        --max-session "$MAX_SESSION" \
        --max-turns "$MAX_TURNS" \
        --context-timeout "$CONTEXT_TIMEOUT" \
        --no-semantic \
        -o "$output_path" 2>/dev/null || exit_code=$?

      if [[ "$exit_code" -ge 0 && "$exit_code" -le 4 ]] && [[ -f "$output_path" ]]; then
        retried=true
        local retry_trace
        retry_trace=$(jq -r '.execution_summary.trace_messages // 0' "$output_path" 2>/dev/null || echo "0")
        if [[ "$retry_trace" -eq 0 ]]; then
          mv "$output_path" "${output_path%.json}.INCONCLUSIVE.json"
          INCONCLUSIVES=$((INCONCLUSIVES + 1))
          tier_str="INCONCLUSIVE"
        else
          COMPLETED=$((COMPLETED + 1))
          tier_str=$(tier_to_string "$(exit_code_to_tier "$exit_code")")
        fi
        break
      fi
    done

    if [[ "$retried" != true ]]; then
      write_error_file "$output_path" "Retries exhausted (exit $exit_code): $stderr_content" "$exit_code"
      ERRORS=$((ERRORS + 1))
      tier_str="ERROR"
    fi
  else
    # Non-retryable error
    write_error_file "$output_path" "Exit code $exit_code: $stderr_content" "$exit_code"
    ERRORS=$((ERRORS + 1))
    tier_str="ERROR"
  fi

  RUN_COUNTER=$((RUN_COUNTER + 1))
  printf "[%d/%d] %s × %s run %d: %s (%ds)\n" \
    "$RUN_COUNTER" "$TOTAL_EXPECTED" "$model_id" "$scenario_id" "$run_num" "$tier_str" "$elapsed"

  # Write progress every 10 runs
  if (( RUN_COUNTER % 10 == 0 )); then
    write_progress
  fi
}

write_error_file() {
  local output_path="$1" message="$2" exit_code="$3"
  local error_path="${output_path%.json}.ERROR.json"
  jq -n \
    --arg error "$message" \
    --argjson exit_code "$exit_code" \
    --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{error: $error, exit_code: $exit_code, timestamp: $timestamp}' > "$error_path"
  # Remove the normal output if it exists
  rm -f "$output_path"
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
    --argjson total "$TOTAL_EXPECTED" \
    --argjson completed "$COMPLETED" \
    --argjson errors "$ERRORS" \
    --argjson inconclusive "$INCONCLUSIVES" \
    --argjson skipped "$SKIPPED" \
    --argjson elapsed "$elapsed" \
    --argjson est_remaining "$rate" \
    '{
      total_expected: $total,
      completed: $completed,
      errors: $errors,
      inconclusive: $inconclusive,
      skipped: $skipped,
      elapsed_seconds: $elapsed,
      estimated_remaining_seconds: $est_remaining
    }' > "$RUN_DIR/progress.json"
}

# --- Main execution loop: model-outer ---
# Use newline-separated strings instead of arrays for bash 3 compatibility
ATTACK_IDS_STR="$(get_attack_scenario_ids)"
UTILITY_IDS_STR="$(get_utility_scenario_ids)"

# Apply scenario filter
if [[ -n "${SCENARIO_FILTER:-}" ]]; then
  ATTACK_IDS_STR="$(echo "$ATTACK_IDS_STR" | grep "^${SCENARIO_FILTER}$" || true)"
  UTILITY_IDS_STR="$(echo "$UTILITY_IDS_STR" | grep "^${SCENARIO_FILTER}$" || true)"

  # Recalculate total for filtered scenario set
  local ATTACK_FILTERED=0
  local UTILITY_FILTERED=0
  [[ -n "$ATTACK_IDS_STR" ]] && ATTACK_FILTERED=$(echo "$ATTACK_IDS_STR" | wc -l | tr -d ' ')
  [[ -n "$UTILITY_IDS_STR" ]] && UTILITY_FILTERED=$(echo "$UTILITY_IDS_STR" | wc -l | tr -d ' ')
  TOTAL_EXPECTED=$(( (ATTACK_FILTERED + UTILITY_FILTERED) * MODEL_COUNT * RUNS_PER ))
fi

log "Expected total runs: $TOTAL_EXPECTED ($MODEL_COUNT models × $RUNS_PER runs)"

LAST_PROVIDER=""

for idx in $(get_model_indices); do
  model_id=$(get_model_field "$idx" ".id")
  model_type=$(get_model_field "$idx" ".type")
  context_args=$(get_model_field "$idx" ".context_args")
  api_key_env=$(get_model_field "$idx" ".api_key_env")
  provider=$(get_model_field "$idx" ".provider")

  temperature=$(get_temperature "$model_type")
  api_key=$(resolve_api_key "$api_key_env")

  inter_run_delay=$(get_rate_limit "$provider" "inter_run_delay_ms")
  inter_model_delay=$(get_rate_limit "$provider" "inter_model_delay_ms")

  # Inter-model delay when switching models on same provider
  if [[ "$provider" == "$LAST_PROVIDER" ]]; then
    sleep_ms "$inter_model_delay"
  fi
  LAST_PROVIDER="$provider"

  log "Starting model: $model_id ($provider)"

  # --- Attack scenarios ---
  if [[ -n "$ATTACK_IDS_STR" ]]; then
    while IFS= read -r scenario_id; do
      [[ -z "$scenario_id" ]] && continue
      for run_num in $(seq 1 "$RUNS_PER"); do
        if is_run_complete "$RUN_DIR/results" "$model_id" "$scenario_id" "$run_num"; then
          SKIPPED=$((SKIPPED + 1))
          RUN_COUNTER=$((RUN_COUNTER + 1))
          continue
        fi

        execute_run "$model_id" "$scenario_id" "$run_num" \
          "$RUN_DIR/scenarios/${scenario_id}.yaml" \
          "$RUN_DIR/results" \
          "$context_args" "$api_key" "$temperature" "$provider"

        sleep_ms "$inter_run_delay"
      done
    done <<< "$ATTACK_IDS_STR"
  fi

  # --- Utility scenarios ---
  if [[ -n "$UTILITY_IDS_STR" ]]; then
    while IFS= read -r scenario_id; do
      [[ -z "$scenario_id" ]] && continue
      for run_num in $(seq 1 "$RUNS_PER"); do
        if is_run_complete "$RUN_DIR/utility-results" "$model_id" "$scenario_id" "$run_num"; then
          SKIPPED=$((SKIPPED + 1))
          RUN_COUNTER=$((RUN_COUNTER + 1))
          continue
        fi

        execute_run "$model_id" "$scenario_id" "$run_num" \
          "$RUN_DIR/utility/${scenario_id}.yaml" \
          "$RUN_DIR/utility-results" \
          "$context_args" "$api_key" "$temperature" "$provider"

        sleep_ms "$inter_run_delay"
      done
    done <<< "$UTILITY_IDS_STR"
  fi

  log "Completed model: $model_id"
done

# Final progress write
write_progress

log "Phase 4 complete: $COMPLETED succeeded, $ERRORS errors, $INCONCLUSIVES inconclusive, $SKIPPED skipped"
