#!/usr/bin/env bash
# Phase 1: Import & freeze scenarios
# Sourced by run.sh — REPO_ROOT, RUN_DIR, etc. are already set.

# Create run directory structure
mkdir -p "$RUN_DIR"/{scenarios,utility,baseline,results,utility-results}
log "Created run directory: $RUN_DIR"

# --- Write metadata.json ---
TJ_BIN=$(get_thoughtjack_bin)
TJ_VERSION=$("$TJ_BIN" version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "unknown")

# Scenario commit: if scenarios/ is a submodule, get its HEAD; otherwise "local"
SCENARIO_SOURCE=$(get_manifest_value '.scenario_source')
if git -C "$REPO_ROOT/$SCENARIO_SOURCE" rev-parse HEAD &>/dev/null; then
  SCENARIO_COMMIT=$(git -C "$REPO_ROOT/$SCENARIO_SOURCE" rev-parse --short HEAD)
else
  SCENARIO_COMMIT="local"
fi

BENCHMARK_COMMIT=$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")

MODEL_COUNT=$(get_model_count)
ATTACK_SCENARIO_COUNT=$(get_attack_scenario_count)
UTILITY_SCENARIO_COUNT=$(get_utility_scenario_count)
RUNS_PER=$(get_config_value '.run.runs_per_scenario')

# Collect model IDs
MODELS_JSON=$(
  for idx in $(get_model_indices); do
    get_model_field "$idx" ".id"
  done | jq -R -s 'split("\n") | map(select(length > 0))'
)

jq -n \
  --arg date "$RUN_DATE" \
  --arg started_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg tj_version "$TJ_VERSION" \
  --arg scenario_commit "$SCENARIO_COMMIT" \
  --arg benchmark_commit "$BENCHMARK_COMMIT" \
  --argjson model_count "$MODEL_COUNT" \
  --argjson attack_count "$ATTACK_SCENARIO_COUNT" \
  --argjson utility_count "$UTILITY_SCENARIO_COUNT" \
  --argjson runs_per "$RUNS_PER" \
  --arg pipeline_version "$PIPELINE_VERSION" \
  --argjson models_tested "$MODELS_JSON" \
  '{
    date: $date,
    started_at: $started_at,
    thoughtjack_version: $tj_version,
    scenario_commit: $scenario_commit,
    benchmark_commit: $benchmark_commit,
    model_count: $model_count,
    attack_scenario_count: $attack_count,
    utility_scenario_count: $utility_count,
    runs_per_scenario: $runs_per,
    pipeline_version: $pipeline_version,
    models_tested: $models_tested,
    status: "running"
  }' > "$RUN_DIR/metadata.json"

log "Written metadata.json"

# --- Import attack scenarios ---
IMPORTED_ATTACKS=0

# Import primaries
PCOUNT=$(yq '.scenarios.primaries | length' "$REPO_ROOT/manifest.yaml")
for i in $(seq 0 $(( PCOUNT - 1 ))); do
  sid=$(yq ".scenarios.primaries[$i].id" "$REPO_ROOT/manifest.yaml")
  spath=$(yq ".scenarios.primaries[$i].path" "$REPO_ROOT/manifest.yaml")
  src="$REPO_ROOT/$SCENARIO_SOURCE/$spath"

  if [[ ! -f "$src" ]]; then
    error "Scenario file not found: $src (for $sid)"
    exit 1
  fi

  cp "$src" "$RUN_DIR/scenarios/${sid}.yaml"
  log "  Imported $sid (primary) from $spath"
  IMPORTED_ATTACKS=$((IMPORTED_ATTACKS + 1))
done

# Import variants
VCOUNT=$(yq '.scenarios.variants | length' "$REPO_ROOT/manifest.yaml")
for i in $(seq 0 $(( VCOUNT - 1 ))); do
  sid=$(yq ".scenarios.variants[$i].id" "$REPO_ROOT/manifest.yaml")
  spath=$(yq ".scenarios.variants[$i].path" "$REPO_ROOT/manifest.yaml")
  src="$REPO_ROOT/$SCENARIO_SOURCE/$spath"

  if [[ ! -f "$src" ]]; then
    error "Scenario file not found: $src (for $sid)"
    exit 1
  fi

  cp "$src" "$RUN_DIR/scenarios/${sid}.yaml"
  log "  Imported $sid (variant) from $spath"
  IMPORTED_ATTACKS=$((IMPORTED_ATTACKS + 1))
done

# Verify attack count
if [[ "$IMPORTED_ATTACKS" -ne "$ATTACK_SCENARIO_COUNT" ]]; then
  error "Attack scenario count mismatch: imported $IMPORTED_ATTACKS, expected $ATTACK_SCENARIO_COUNT"
  exit 1
fi
log "Imported $IMPORTED_ATTACKS attack scenarios"

# --- Import utility scenarios ---
IMPORTED_UTILS=0
UTILITY_SOURCE=$(get_manifest_value '.utility.source')
UCOUNT=$(yq '.utility.scenarios | length' "$REPO_ROOT/manifest.yaml")

for i in $(seq 0 $(( UCOUNT - 1 ))); do
  sid=$(yq ".utility.scenarios[$i].id" "$REPO_ROOT/manifest.yaml")
  upath=$(yq ".utility.scenarios[$i].path" "$REPO_ROOT/manifest.yaml")
  src="$REPO_ROOT/$UTILITY_SOURCE/$upath"

  if [[ ! -f "$src" ]]; then
    error "Utility scenario file not found: $src (for $sid)"
    exit 1
  fi

  cp "$src" "$RUN_DIR/utility/${sid}.yaml"
  log "  Imported $sid from $upath"
  IMPORTED_UTILS=$((IMPORTED_UTILS + 1))
done

if [[ "$IMPORTED_UTILS" -ne "$UTILITY_SCENARIO_COUNT" ]]; then
  error "Utility scenario count mismatch: imported $IMPORTED_UTILS, expected $UTILITY_SCENARIO_COUNT"
  exit 1
fi
log "Imported $IMPORTED_UTILS utility scenarios"

# --- Copy baseline YAMLs ---
cp "$REPO_ROOT/baseline/OATF-BASELINE-MCP.yaml" "$RUN_DIR/baseline/"
cp "$REPO_ROOT/baseline/OATF-BASELINE-A2A.yaml" "$RUN_DIR/baseline/"
log "Copied baseline scenarios"

log "Phase 1 complete: $IMPORTED_ATTACKS attack + $IMPORTED_UTILS utility scenarios frozen"
