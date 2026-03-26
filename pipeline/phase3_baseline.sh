#!/usr/bin/env bash
# Phase 3: Baseline model verification
# Sourced by run.sh — REPO_ROOT, RUN_DIR, CI_MODE, etc. are already set.

TJ_BIN=$(get_thoughtjack_bin)
MODEL_COUNT=$(get_model_count)

PASSED=0
FAILED=0
FAILED_MODELS=""

run_baseline() {
  local model_id="$1" context_args="$2" api_key="$3" temperature="$4"
  local baseline_name="$5" baseline_yaml="$6" output_path="$7"

  local exit_code=0
  # Word-split context_args intentionally
  # shellcheck disable=SC2086
  "$TJ_BIN" run \
    --config "$baseline_yaml" \
    --context \
    $context_args \
    --context-api-key "$api_key" \
    --context-temperature "$temperature" \
    --max-session 60s \
    --no-semantic \
    -o "$output_path" 2>/dev/null || exit_code=$?

  echo "$exit_code"
}

verify_baseline() {
  local output_path="$1" baseline_name="$2" exit_code="$3"

  # Must have produced an output file
  if [[ ! -f "$output_path" ]]; then
    echo "FAIL:no output file"
    return
  fi

  # Must be valid JSON with verdict
  if ! jq -e '.verdict' "$output_path" &>/dev/null; then
    echo "FAIL:invalid JSON or missing verdict"
    return
  fi

  # Must have trace events
  local trace_msgs
  trace_msgs=$(jq -r '.execution_summary.trace_messages // 0' "$output_path")
  if [[ "$trace_msgs" -eq 0 ]]; then
    echo "FAIL:zero trace events"
    return
  fi

  # Must be T1 (exploited/ingested) — exit code 1
  # T0 (exit code 0) means the model didn't call the tool = misconfiguration
  if [[ "$exit_code" -eq 0 ]]; then
    echo "FAIL:T0 (model did not call tool)"
    return
  fi

  if [[ "$exit_code" -ne 1 ]]; then
    local tier_str
    tier_str=$(tier_to_string "$(exit_code_to_tier "$exit_code")")
    echo "FAIL:unexpected exit code $exit_code ($tier_str)"
    return
  fi

  echo "PASS"
}

log "Running baselines for $MODEL_COUNT model(s)..."
echo ""

for idx in $(get_model_indices); do
  model_id=$(get_model_field "$idx" ".id")
  model_name=$(get_model_field "$idx" ".display_name")
  model_type=$(get_model_field "$idx" ".type")
  context_args=$(get_model_field "$idx" ".context_args")
  api_key_env=$(get_model_field "$idx" ".api_key_env")

  temperature=$(get_temperature "$model_type")
  api_key=$(resolve_api_key "$api_key_env")

  start_time=$SECONDS

  # Run MCP baseline
  mcp_output="$RUN_DIR/baseline/${model_id}_mcp.json"
  mcp_exit=$(run_baseline "$model_id" "$context_args" "$api_key" "$temperature" \
    "MCP" "$RUN_DIR/baseline/OATF-BASELINE-MCP.yaml" "$mcp_output")
  mcp_result=$(verify_baseline "$mcp_output" "MCP" "$mcp_exit")

  # Run A2A baseline
  a2a_output="$RUN_DIR/baseline/${model_id}_a2a.json"
  a2a_exit=$(run_baseline "$model_id" "$context_args" "$api_key" "$temperature" \
    "A2A" "$RUN_DIR/baseline/OATF-BASELINE-A2A.yaml" "$a2a_output")
  a2a_result=$(verify_baseline "$a2a_output" "A2A" "$a2a_exit")

  elapsed=$(( SECONDS - start_time ))

  # Format result
  if [[ "$mcp_result" == "PASS" ]]; then
    mcp_display="MCP:T1"
  else
    mcp_display="MCP:${mcp_result#FAIL:}"
  fi
  if [[ "$a2a_result" == "PASS" ]]; then
    a2a_display="A2A:T1"
  else
    a2a_display="A2A:${a2a_result#FAIL:}"
  fi

  if [[ "$mcp_result" == "PASS" && "$a2a_result" == "PASS" ]]; then
    printf "  ✓ %-22s %s %s (%ds)\n" "$model_name" "$mcp_display" "$a2a_display" "$elapsed"
    PASSED=$((PASSED + 1))
  else
    printf "  ✗ %-22s %s %s (%ds)\n" "$model_name" "$mcp_display" "$a2a_display" "$elapsed"
    FAILED=$((FAILED + 1))
    FAILED_MODELS="$FAILED_MODELS $model_id"
  fi
done

echo ""
log "$PASSED/$MODEL_COUNT models passed. $FAILED failed."

# --- Confirmation gate ---
if [[ "$FAILED" -gt 0 ]]; then
  echo ""
  if [[ "$CI_MODE" == true ]]; then
    error "Baseline verification failed in CI mode. Failed models:$FAILED_MODELS"
    exit 1
  fi

  # Interactive mode
  for fm in $FAILED_MODELS; do
    echo "  $fm failed baseline."
  done
  echo ""
  echo "Pipeline cannot continue with failed baselines."
  echo ""
  echo "  [fix]   Fix the issue and re-run baselines for failed model(s)"
  echo "  [abort] Exit pipeline"
  echo ""

  while true; do
    read -rp "Choice: [fix/abort] " choice
    case "$choice" in
      fix)
        log "Fix mode: re-running baselines for failed models..."
        # Re-run only failed models
        for fm in $FAILED_MODELS; do
          log "Re-running baselines for $fm..."
          # Find the model index
          for retry_idx in $(seq 0 $(( $(yq '.models | length' "$REPO_ROOT/config.yaml") - 1 ))); do
            retry_id=$(yq ".models[$retry_idx].id" "$REPO_ROOT/config.yaml")
            if [[ "$retry_id" == "$fm" ]]; then
              model_type=$(yq ".models[$retry_idx].type" "$REPO_ROOT/config.yaml")
              context_args=$(yq ".models[$retry_idx].context_args" "$REPO_ROOT/config.yaml")
              api_key_env=$(yq ".models[$retry_idx].api_key_env" "$REPO_ROOT/config.yaml")
              temperature=$(get_temperature "$model_type")
              api_key=$(resolve_api_key "$api_key_env")

              mcp_output="$RUN_DIR/baseline/${fm}_mcp.json"
              mcp_exit=$(run_baseline "$fm" "$context_args" "$api_key" "$temperature" \
                "MCP" "$RUN_DIR/baseline/OATF-BASELINE-MCP.yaml" "$mcp_output")
              mcp_result=$(verify_baseline "$mcp_output" "MCP" "$mcp_exit")

              a2a_output="$RUN_DIR/baseline/${fm}_a2a.json"
              a2a_exit=$(run_baseline "$fm" "$context_args" "$api_key" "$temperature" \
                "A2A" "$RUN_DIR/baseline/OATF-BASELINE-A2A.yaml" "$a2a_output")
              a2a_result=$(verify_baseline "$a2a_output" "A2A" "$a2a_exit")

              if [[ "$mcp_result" == "PASS" && "$a2a_result" == "PASS" ]]; then
                log "  ✓ $fm passed on retry"
              else
                error "  ✗ $fm still failing: MCP=$mcp_result A2A=$a2a_result"
                error "Cannot continue. Aborting."
                exit 1
              fi
              break
            fi
          done
        done
        log "All previously failed models now passing"
        break
        ;;
      abort)
        error "Aborted by user"
        exit 1
        ;;
      *)
        echo "Please enter 'fix' or 'abort'"
        ;;
    esac
  done
fi

log "Phase 3 complete: all models verified"
