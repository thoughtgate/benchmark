#!/usr/bin/env bash
# Phase 5: Verify result integrity
# Sourced by run.sh — REPO_ROOT, RUN_DIR, etc. are already set.

RUNS_PER=$(get_config_value '.run.runs_per_scenario')
MODEL_COUNT=$(get_model_count)
ATTACK_COUNT=$(get_attack_scenario_count)
UTILITY_COUNT=$(get_utility_scenario_count)

CHECKS_JSON='{"checks":{}}'
WARNINGS=""
OVERALL="pass"

add_check() {
  local name="$1" status="$2"
  shift 2
  local extra="$*"
  CHECKS_JSON=$(echo "$CHECKS_JSON" | jq --arg name "$name" --arg status "$status" \
    '.checks[$name] = {status: $status}')
  if [[ -n "$extra" ]]; then
    CHECKS_JSON=$(echo "$CHECKS_JSON" | jq --arg name "$name" --argjson extra "$extra" \
      '.checks[$name] += $extra')
  fi
}

# --- 1. Attack completeness ---
EXPECTED_ATTACKS=$((MODEL_COUNT * ATTACK_COUNT * RUNS_PER))
FOUND=0
FOUND_ERRORS=0
FOUND_INCONCLUSIVE=0
MISSING=0

for idx in $(get_model_indices); do
  model_id=$(get_model_field "$idx" ".id")
  while IFS= read -r scenario_id; do
    [[ -z "$scenario_id" ]] && continue
    for run_num in $(seq 1 "$RUNS_PER"); do
      base="$RUN_DIR/results/$model_id/${scenario_id}_run${run_num}"
      if [[ -f "${base}.json" ]]; then
        FOUND=$((FOUND + 1))
      elif [[ -f "${base}.INCONCLUSIVE.json" ]]; then
        FOUND_INCONCLUSIVE=$((FOUND_INCONCLUSIVE + 1))
      elif [[ -f "${base}.ERROR.json" ]]; then
        FOUND_ERRORS=$((FOUND_ERRORS + 1))
      else
        MISSING=$((MISSING + 1))
      fi
    done
  done < <(get_attack_scenario_ids)
done

TOTAL_ACCOUNTED=$((FOUND + FOUND_ERRORS + FOUND_INCONCLUSIVE))
COMPLETENESS_PCT=0
if [[ "$EXPECTED_ATTACKS" -gt 0 ]]; then
  COMPLETENESS_PCT=$(( (TOTAL_ACCOUNTED * 100) / EXPECTED_ATTACKS ))
fi

COMPLETENESS_STATUS="pass"
if [[ "$COMPLETENESS_PCT" -lt 90 ]]; then
  COMPLETENESS_STATUS="fail"
  OVERALL="fail"
fi
add_check "completeness" "$COMPLETENESS_STATUS" \
  "{\"expected\": $EXPECTED_ATTACKS, \"found\": $FOUND, \"errors\": $FOUND_ERRORS, \"inconclusive\": $FOUND_INCONCLUSIVE, \"missing\": $MISSING}"

log "Completeness: $FOUND success + $FOUND_ERRORS errors + $FOUND_INCONCLUSIVE inconclusive / $EXPECTED_ATTACKS expected ($COMPLETENESS_PCT%)"

# --- 2. Error rate per model ---
ERROR_FLAGGED=""
for idx in $(get_model_indices); do
  model_id=$(get_model_field "$idx" ".id")
  model_errors=$(find "$RUN_DIR/results/$model_id" -name "*.ERROR.json" 2>/dev/null | wc -l | tr -d ' ')
  model_expected=$((ATTACK_COUNT * RUNS_PER))
  if [[ "$model_expected" -gt 0 ]]; then
    error_pct=$(( (model_errors * 100) / model_expected ))
    if [[ "$error_pct" -gt 20 ]]; then
      ERROR_FLAGGED="$ERROR_FLAGGED $model_id"
      WARNINGS="$WARNINGS|$model_id error rate ${error_pct}%"
    fi
  fi
done

if [[ -n "$ERROR_FLAGGED" ]]; then
  ERROR_STATUS="warn"
  [[ "$OVERALL" == "pass" ]] && OVERALL="pass_with_warnings"
else
  ERROR_STATUS="pass"
fi
ERROR_MODELS_JSON=$(echo "$ERROR_FLAGGED" | tr ' ' '\n' | grep -v '^$' | jq -R -s 'split("\n") | map(select(length > 0))')
add_check "error_rate" "$ERROR_STATUS" "{\"flagged_models\": $ERROR_MODELS_JSON}"

# --- 3. Result validity ---
INVALID=0
for result_file in "$RUN_DIR"/results/*/*.json; do
  [[ -f "$result_file" ]] || continue
  # Skip ERROR and INCONCLUSIVE files
  [[ "$result_file" == *.ERROR.json ]] && continue
  [[ "$result_file" == *.INCONCLUSIVE.json ]] && continue

  if ! jq -e '.verdict' "$result_file" &>/dev/null; then
    INVALID=$((INVALID + 1))
    warn "Invalid result file: $result_file"
  fi
done

VALIDITY_STATUS="pass"
if [[ "$INVALID" -gt 0 ]]; then
  VALIDITY_STATUS="warn"
  [[ "$OVERALL" == "pass" ]] && OVERALL="pass_with_warnings"
fi
add_check "result_validity" "$VALIDITY_STATUS" "{\"invalid\": $INVALID}"

# --- 4. Determinism ---
LOW_CONSISTENCY=0
for idx in $(get_model_indices); do
  model_id=$(get_model_field "$idx" ".id")
  while IFS= read -r scenario_id; do
    [[ -z "$scenario_id" ]] && continue
    tier_list=""
    tier_count=0
    for run_num in $(seq 1 "$RUNS_PER"); do
      result_file="$RUN_DIR/results/$model_id/${scenario_id}_run${run_num}.json"
      if [[ -f "$result_file" ]]; then
        tier=$(jq -r '.verdict.max_tier // "none"' "$result_file")
        tier_list="$tier_list $tier"
        tier_count=$((tier_count + 1))
      fi
    done
    if [[ "$tier_count" -ge 3 ]]; then
      unique=$(echo "$tier_list" | tr ' ' '\n' | grep -v '^$' | sort -u | wc -l | tr -d ' ')
      if [[ "$unique" -eq "$tier_count" ]]; then
        LOW_CONSISTENCY=$((LOW_CONSISTENCY + 1))
      fi
    fi
  done < <(get_attack_scenario_ids)
done
add_check "determinism" "info" "{\"low_consistency_pairs\": $LOW_CONSISTENCY}"

# --- 5. Tier distribution sanity ---
TIER_STATUS="pass"

# Check: no model is 100% T0 (only meaningful if most scenarios were run)
EXPECTED_PER_MODEL=$((ATTACK_COUNT * RUNS_PER))
for idx in $(get_model_indices); do
  model_id=$(get_model_field "$idx" ".id")
  non_t0=0
  total_valid=0
  for result_file in "$RUN_DIR/results/$model_id"/*.json; do
    [[ -f "$result_file" ]] || continue
    [[ "$result_file" == *.ERROR.json ]] && continue
    [[ "$result_file" == *.INCONCLUSIVE.json ]] && continue
    total_valid=$((total_valid + 1))
    verdict=$(jq -r '.verdict.result' "$result_file" 2>/dev/null || echo "unknown")
    if [[ "$verdict" != "not_exploited" ]]; then
      non_t0=$((non_t0 + 1))
    fi
  done
  # Only flag if >50% of expected runs completed and all are T0
  threshold=$((EXPECTED_PER_MODEL / 2))
  if [[ "$total_valid" -gt "$threshold" && "$total_valid" -gt 0 && "$non_t0" -eq 0 ]]; then
    TIER_STATUS="fail"
    OVERALL="fail"
    WARNINGS="$WARNINGS|$model_id is 100% T0 across $total_valid runs — systematic bug suspected"
  fi
done

# Check: no scenario is 100% ERROR (only if at least one file exists for it)
while IFS= read -r scenario_id; do
  [[ -z "$scenario_id" ]] && continue
  has_error=false
  has_success=false
  for idx in $(get_model_indices); do
    model_id=$(get_model_field "$idx" ".id")
    for run_num in $(seq 1 "$RUNS_PER"); do
      base="$RUN_DIR/results/$model_id/${scenario_id}_run${run_num}"
      if [[ -f "${base}.json" ]] || [[ -f "${base}.INCONCLUSIVE.json" ]]; then
        has_success=true
        break 2
      elif [[ -f "${base}.ERROR.json" ]]; then
        has_error=true
      fi
    done
  done
  if [[ "$has_error" == true && "$has_success" == false ]]; then
    TIER_STATUS="fail"
    OVERALL="fail"
    WARNINGS="$WARNINGS|$scenario_id is 100% ERROR across all models — scenario bug suspected"
  fi
done < <(get_attack_scenario_ids)

add_check "tier_distribution" "$TIER_STATUS"

# --- 6. Utility completeness ---
EXPECTED_UTILS=$((MODEL_COUNT * UTILITY_COUNT * RUNS_PER))
UTIL_FOUND=0
UTIL_ERRORS=0
for idx in $(get_model_indices); do
  model_id=$(get_model_field "$idx" ".id")
  while IFS= read -r scenario_id; do
    [[ -z "$scenario_id" ]] && continue
    for run_num in $(seq 1 "$RUNS_PER"); do
      base="$RUN_DIR/utility-results/$model_id/${scenario_id}_run${run_num}"
      if [[ -f "${base}.json" ]]; then
        UTIL_FOUND=$((UTIL_FOUND + 1))
      elif [[ -f "${base}.ERROR.json" ]]; then
        UTIL_ERRORS=$((UTIL_ERRORS + 1))
      fi
    done
  done < <(get_utility_scenario_ids)
done
add_check "utility_completeness" "pass" "{\"expected\": $EXPECTED_UTILS, \"found\": $UTIL_FOUND, \"errors\": $UTIL_ERRORS}"

# --- Write integrity.json ---
# Convert pipe-separated WARNINGS to JSON array
WARNINGS_JSON=$(echo "$WARNINGS" | tr '|' '\n' | grep -v '^$' | jq -R -s 'split("\n") | map(select(length > 0))')
CHECKS_JSON=$(echo "$CHECKS_JSON" | jq --arg overall "$OVERALL" --argjson warnings "$WARNINGS_JSON" \
  '.overall = $overall | .warnings = $warnings')
echo "$CHECKS_JSON" | jq '.' > "$RUN_DIR/integrity.json"

log "Integrity check: $OVERALL"

# Gate
if [[ "$OVERALL" == "fail" ]]; then
  error "Integrity check failed. See $RUN_DIR/integrity.json"
  echo "$WARNINGS" | tr '|' '\n' | while IFS= read -r w; do
    [[ -n "$w" ]] && error "  $w"
  done
  exit 1
fi

log "Phase 5 complete"
