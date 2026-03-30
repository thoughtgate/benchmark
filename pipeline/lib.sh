#!/usr/bin/env bash
# Shared helpers for pipeline scripts.
# Sourced by run.sh and all phase scripts.

# --- Logging ---

log() {
  echo "[$(date +%H:%M:%S)] $*"
}

log_phase() {
  echo ""
  echo "━━━ Phase $1: $2 ━━━"
  echo ""
}

error() {
  echo "[$(date +%H:%M:%S)] ERROR: $*" >&2
}

warn() {
  echo "[$(date +%H:%M:%S)] WARN: $*" >&2
}

# --- Config helpers ---

get_thoughtjack_bin() {
  echo "${THOUGHTJACK_BINARY:-$(yq '.thoughtjack.binary' "$REPO_ROOT/config.yaml")}"
}

get_config_value() {
  yq "$1" "$REPO_ROOT/config.yaml"
}

get_manifest_value() {
  yq "$1" "$REPO_ROOT/manifest.yaml"
}

# --- Model helpers ---

# Build yq filter expression for models based on --model / --provider flags.
# --model takes precedence over --provider.
_model_filter_expr() {
  if [[ -n "${MODEL_FILTER:-}" ]]; then
    echo ".models | map(select(.id == \"$MODEL_FILTER\"))"
  elif [[ -n "${PROVIDER_FILTER:-}" ]]; then
    echo ".models | map(select(.provider == \"$PROVIDER_FILTER\"))"
  else
    echo ".models"
  fi
}

get_model_count() {
  yq "$(_model_filter_expr) | length" "$REPO_ROOT/config.yaml"
}

get_model_indices() {
  local count
  count=$(get_model_count)
  seq 0 $(( count - 1 ))
}

# Get a field from a model by index.
# Usage: get_model_field 0 ".id"
get_model_field() {
  local idx="$1" field="$2"
  yq "$(_model_filter_expr) | .[${idx}]${field}" "$REPO_ROOT/config.yaml"
}

# Get temperature for a model based on its type.
get_temperature() {
  local model_type="$1"
  if [[ "$model_type" == "reasoning" || "$model_type" == "hybrid" ]]; then
    get_config_value '.run.temperature_reasoning'
  else
    get_config_value '.run.temperature_default'
  fi
}

# Resolve API key from environment variable name.
resolve_api_key() {
  local env_var="$1"
  local value="${!env_var:-}"
  if [[ -z "$value" ]]; then
    error "API key environment variable $env_var is not set"
    return 1
  fi
  echo "$value"
}

# Get rate limit for a provider.
get_rate_limit() {
  local provider="$1" field="$2"
  get_config_value ".rate_limits.${provider}.${field}"
}

# --- Scenario helpers ---

# Get scenario IDs from manifest (primaries + variants, excluding pending)
get_attack_scenario_ids() {
  {
    yq '.scenarios.primaries[].id' "$REPO_ROOT/manifest.yaml"
    yq '.scenarios.variants[].id' "$REPO_ROOT/manifest.yaml"
  } | grep -v '^null$' || true
}

get_attack_scenario_count() {
  local primaries variants
  primaries=$(yq '.scenarios.primaries | length' "$REPO_ROOT/manifest.yaml")
  variants=$(yq '.scenarios.variants | length' "$REPO_ROOT/manifest.yaml")
  echo $(( primaries + variants ))
}

get_utility_scenario_ids() {
  yq '.utility.scenarios[].id' "$REPO_ROOT/manifest.yaml" | grep -v '^null$' || true
}

get_utility_scenario_count() {
  yq '.utility.scenarios | length' "$REPO_ROOT/manifest.yaml"
}

# --- Run helpers ---

# Build ThoughtJack run command arguments (common to baseline, attack, utility).
# Usage: build_tj_args <scenario_yaml> <output_path> <context_args> <api_key> <temperature> [extra_args...]
build_tj_args() {
  local scenario="$1" output="$2" context_args="$3" api_key="$4" temperature="$5"
  shift 5
  local max_session max_turns context_timeout
  max_session=$(get_config_value '.run.max_session')
  max_turns=$(get_config_value '.run.max_turns')
  context_timeout=$(get_config_value '.run.context_timeout')

  echo "$scenario" \
    "--context" \
    $context_args \
    "--context-api-key" "$api_key" \
    "--context-temperature" "$temperature" \
    "--max-session" "$max_session" \
    "--max-turns" "$max_turns" \
    "--context-timeout" "$context_timeout" \
    "--no-semantic" \
    "-o" "$output" \
    "$@"
}

# Map ThoughtJack exit code to tier number.
exit_code_to_tier() {
  case "$1" in
    0) echo 0 ;;  # not_exploited / T0
    1) echo 1 ;;  # exploited / T1 ingested
    2) echo 2 ;;  # exploited / T2 local_action
    3) echo 3 ;;  # exploited / T3 boundary_breach
    4) echo -1 ;; # partial
    5) echo -2 ;; # error
    10) echo -3 ;; # runtime error
    *) echo -4 ;;  # unknown
  esac
}

# Map tier number to display string.
tier_to_string() {
  case "$1" in
    0) echo "T0" ;;
    1) echo "T1" ;;
    2) echo "T2" ;;
    3) echo "T3" ;;
    -1) echo "PARTIAL" ;;
    -2) echo "ERROR" ;;
    -3) echo "RUNTIME_ERROR" ;;
    *) echo "UNKNOWN" ;;
  esac
}

# Sleep for milliseconds (accepts integer ms, converts to seconds).
sleep_ms() {
  local ms="$1"
  if [[ "$ms" -gt 0 ]]; then
    sleep "$(python3 -c "print($ms/1000)")"
  fi
}

# Check if an exit code is retryable.
is_retryable_error() {
  local exit_code="$1"
  # Exit 10 = runtime error (transient), exit 5 = evaluation error
  # We also check stderr for HTTP status codes
  [[ "$exit_code" -eq 10 ]]
}
