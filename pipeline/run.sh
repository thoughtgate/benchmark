#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

source "$SCRIPT_DIR/lib.sh"

# --- Defaults ---
FORCE=false
SUFFIX=""
CI_MODE=false
PHASES=""
RESUME=false
PROVIDER_FILTER=""
MODEL_FILTER=""
SCENARIO_FILTER=""
NO_RETRY_ERRORS=false
PIPELINE_VERSION="1.0.0"

# --- Flag parsing ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=true; shift ;;
    --suffix) SUFFIX="$2"; shift 2 ;;
    --ci) CI_MODE=true; shift ;;
    --phases) PHASES="$2"; shift 2 ;;
    --resume) RESUME=true; shift ;;
    --provider) PROVIDER_FILTER="$2"; shift 2 ;;
    --model) MODEL_FILTER="$2"; shift 2 ;;
    --scenario) SCENARIO_FILTER="$2"; shift 2 ;;
    --no-retry-errors) NO_RETRY_ERRORS=true; shift ;;
    -h|--help)
      echo "Usage: ./pipeline/run.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --force              Overwrite existing run directory"
      echo "  --suffix NAME        Append suffix to run directory (runs/YYYY-MM-DD-NAME)"
      echo "  --ci                 CI mode (no interactive prompts)"
      echo "  --phases 0,1,2,...   Run only specified phases"
      echo "  --resume             Resume from existing run directory"
      echo "  --provider NAME      Filter to models from this provider"
      echo "  --model ID           Filter to a specific model"
      echo "  --scenario ID        Filter to a specific scenario"
      echo "  --no-retry-errors    Don't retry ERROR files on resume"
      exit 0
      ;;
    *) error "Unknown flag: $1"; exit 64 ;;
  esac
done

export REPO_ROOT FORCE CI_MODE RESUME PROVIDER_FILTER MODEL_FILTER SCENARIO_FILTER NO_RETRY_ERRORS PIPELINE_VERSION

# --- Compute run directory ---
RUN_DATE="$(date +%Y-%m-%d)"
if [[ -n "$SUFFIX" ]]; then
  RUN_DIR="$REPO_ROOT/runs/${RUN_DATE}-${SUFFIX}"
else
  RUN_DIR="$REPO_ROOT/runs/${RUN_DATE}"
fi
export RUN_DIR RUN_DATE

# --- Determine which phases to run ---
if [[ -n "$PHASES" ]]; then
  IFS=',' read -ra PHASE_LIST <<< "$PHASES"
else
  PHASE_LIST=(0 1 2 3 4 5 6 7 8)
fi

should_run_phase() {
  local target="$1"
  for p in "${PHASE_LIST[@]}"; do
    [[ "$p" == "$target" ]] && return 0
  done
  return 1
}

# --- Logging setup ---
PIPELINE_START=$(date +%s)

# ========================================
# Phase 0: Pre-flight
# ========================================
if should_run_phase 0; then
  log_phase 0 "Pre-flight"

  # 1. ThoughtJack binary
  TJ_BIN=$(get_thoughtjack_bin)
  if ! command -v "$TJ_BIN" &>/dev/null; then
    error "ThoughtJack binary '$TJ_BIN' not found. Set THOUGHTJACK_BINARY or install thoughtjack."
    exit 1
  fi

  TJ_VERSION=$("$TJ_BIN" version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "unknown")
  REQUIRED_VERSION=$(get_config_value '.thoughtjack.version_required')
  if [[ "$TJ_VERSION" != "$REQUIRED_VERSION" ]]; then
    warn "ThoughtJack version mismatch: got $TJ_VERSION, expected $REQUIRED_VERSION"
  fi
  log "ThoughtJack: $TJ_BIN (v$TJ_VERSION)"

  # 2. Run directory
  if [[ "$RESUME" == true ]]; then
    if [[ ! -d "$RUN_DIR" ]]; then
      error "Cannot resume: $RUN_DIR does not exist"
      exit 1
    fi
    log "Resuming existing run: $RUN_DIR"
  elif [[ -d "$RUN_DIR" ]]; then
    if [[ "$FORCE" == true ]]; then
      warn "Overwriting existing run directory: $RUN_DIR"
      rm -rf "$RUN_DIR"
    else
      error "Run directory already exists: $RUN_DIR (use --force to overwrite or --suffix to create a new one)"
      exit 1
    fi
  fi

  # 3. Scenario submodule
  SCENARIO_SOURCE=$(get_manifest_value '.scenario_source')
  if [[ ! -d "$REPO_ROOT/$SCENARIO_SOURCE" ]] || [[ -z "$(ls -A "$REPO_ROOT/$SCENARIO_SOURCE" 2>/dev/null)" ]]; then
    error "Scenario source directory is empty or missing: $REPO_ROOT/$SCENARIO_SOURCE"
    exit 1
  fi
  log "Scenario source: $REPO_ROOT/$SCENARIO_SOURCE"

  # 4. Utility scenarios
  UTILITY_SOURCE=$(get_manifest_value '.utility.source')
  if [[ ! -d "$REPO_ROOT/$UTILITY_SOURCE" ]]; then
    error "Utility scenario directory missing: $REPO_ROOT/$UTILITY_SOURCE"
    exit 1
  fi
  log "Utility source: $REPO_ROOT/$UTILITY_SOURCE"

  # 5. API keys
  MISSING_KEYS=0
  for idx in $(get_model_indices); do
    key_env=$(get_model_field "$idx" ".api_key_env")
    if [[ -z "${!key_env:-}" ]]; then
      error "Missing API key: \$$key_env (for model $(get_model_field "$idx" ".id"))"
      MISSING_KEYS=$((MISSING_KEYS + 1))
    fi
  done
  if [[ "$MISSING_KEYS" -gt 0 ]]; then
    error "$MISSING_KEYS API key(s) missing"
    exit 1
  fi
  log "API keys: all present"

  # 6. Required tools
  for tool in jq yq python3 git; do
    if ! command -v "$tool" &>/dev/null; then
      error "Required tool not found: $tool"
      exit 1
    fi
  done
  log "Required tools: all present"

  # 7. Python dependencies
  if ! python3 -c "import yaml" 2>/dev/null; then
    error "Python pyyaml not installed. Run: pip install pyyaml"
    exit 1
  fi

  log "Pre-flight complete"
fi

# ========================================
# Phase 1: Import & freeze
# ========================================
if should_run_phase 1; then
  log_phase 1 "Import & freeze scenarios"
  source "$SCRIPT_DIR/phase1_import.sh"
fi

# ========================================
# Phase 2: Validate
# ========================================
if should_run_phase 2; then
  log_phase 2 "Validate scenarios"
  source "$SCRIPT_DIR/phase2_validate.sh"
fi

# ========================================
# Phase 3: Baseline
# ========================================
if should_run_phase 3; then
  log_phase 3 "Baseline model verification"
  source "$SCRIPT_DIR/phase3_baseline.sh"
fi

# ========================================
# Phase 4: Execute
# ========================================
if should_run_phase 4; then
  log_phase 4 "Execute benchmark"
  source "$SCRIPT_DIR/phase4_execute.sh"
fi

# ========================================
# Phase 5: Verify
# ========================================
if should_run_phase 5; then
  log_phase 5 "Verify result integrity"
  source "$SCRIPT_DIR/phase5_verify.sh"
fi

# ========================================
# Phase 6: Score
# ========================================
if should_run_phase 6; then
  log_phase 6 "Score results"
  python3 "$SCRIPT_DIR/phase6_score.py" "$RUN_DIR" "$REPO_ROOT"
fi

# ========================================
# Phase 7: Report
# ========================================
if should_run_phase 7; then
  log_phase 7 "Generate report"
  python3 "$SCRIPT_DIR/phase7_report.py" "$RUN_DIR" "$REPO_ROOT"
fi

# ========================================
# Phase 8: Finalise
# ========================================
if should_run_phase 8; then
  log_phase 8 "Finalise"

  PIPELINE_END=$(date +%s)
  DURATION=$((PIPELINE_END - PIPELINE_START))

  # Update metadata.json
  jq --arg completed_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
     --argjson duration "$DURATION" \
     '.status = "complete" | .completed_at = $completed_at | .duration_seconds = $duration' \
     "$RUN_DIR/metadata.json" > "$RUN_DIR/metadata.json.tmp" \
     && mv "$RUN_DIR/metadata.json.tmp" "$RUN_DIR/metadata.json"

  # Print summary
  MODEL_COUNT=$(get_model_count)
  ATTACK_COUNT=$(get_attack_scenario_count)
  UTILITY_COUNT=$(get_utility_scenario_count)
  RUNS_PER=$(get_config_value '.run.runs_per_scenario')
  TOTAL_RUNS=$(( (ATTACK_COUNT + UTILITY_COUNT) * MODEL_COUNT * RUNS_PER ))

  ERRORS=0
  INCONCLUSIVES=0
  if [[ -d "$RUN_DIR/results" ]]; then
    ERRORS=$(find "$RUN_DIR/results" -name "*.ERROR.json" 2>/dev/null | wc -l | tr -d ' ')
    INCONCLUSIVES=$(find "$RUN_DIR/results" -name "*.INCONCLUSIVE.json" 2>/dev/null | wc -l | tr -d ' ')
  fi

  HOURS=$((DURATION / 3600))
  MINS=$(( (DURATION % 3600) / 60 ))

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  ThoughtJack Benchmark — $RUN_DATE"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  printf "  Models:     %d tested\n" "$MODEL_COUNT"
  printf "  Scenarios:  %d attack + %d utility\n" "$ATTACK_COUNT" "$UTILITY_COUNT"
  printf "  Total runs: %d\n" "$TOTAL_RUNS"
  printf "  Errors:     %d\n" "$ERRORS"
  printf "  Duration:   %dh %dm\n" "$HOURS" "$MINS"
  echo ""

  # Print top 5 if scored.json exists
  if [[ -f "$RUN_DIR/scored.json" ]]; then
    echo "  Top 5 (Resistance / Utility):"
    jq -r '.models | sort_by(-.aggregate) | to_entries[] | select(.key < 5) |
      "    \(.key + 1). \(.value.display_name | . + " " * (22 - length)) — \(.value.aggregate | . * 10 | round / 10) / \(.value.utility_score | . * 10 | round / 10)"' \
      "$RUN_DIR/scored.json" 2>/dev/null || true
    echo ""
  fi

  echo "  Results: $RUN_DIR"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # CI: create PR branch and commit
  if [[ "$CI_MODE" == true ]] && [[ -n "${GITHUB_RUN_ID:-}" ]]; then
    log "CI mode: results committed by workflow"
  fi
fi

log "Pipeline complete"
