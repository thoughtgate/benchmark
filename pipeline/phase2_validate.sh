#!/usr/bin/env bash
# Phase 2: Validate scenarios
# Sourced by run.sh — REPO_ROOT, RUN_DIR, etc. are already set.

TJ_BIN=$(get_thoughtjack_bin)
FAILURES=0
VALIDATED=0

# Validate attack scenarios
for yaml in "$RUN_DIR"/scenarios/*.yaml; do
  [[ -f "$yaml" ]] || continue
  if ! "$TJ_BIN" validate "$yaml" &>/dev/null; then
    error "Validation failed: $yaml"
    # Re-run with output visible for diagnostics
    "$TJ_BIN" validate "$yaml" 2>&1 | head -20 || true
    FAILURES=$((FAILURES + 1))
  fi
  VALIDATED=$((VALIDATED + 1))
done

# Validate utility scenarios
for yaml in "$RUN_DIR"/utility/*.yaml; do
  [[ -f "$yaml" ]] || continue
  if ! "$TJ_BIN" validate "$yaml" &>/dev/null; then
    error "Validation failed: $yaml"
    "$TJ_BIN" validate "$yaml" 2>&1 | head -20 || true
    FAILURES=$((FAILURES + 1))
  fi
  VALIDATED=$((VALIDATED + 1))
done

# Validate baseline scenarios
for yaml in "$RUN_DIR"/baseline/*.yaml; do
  [[ -f "$yaml" ]] || continue
  if ! "$TJ_BIN" validate "$yaml" &>/dev/null; then
    error "Validation failed: $yaml"
    "$TJ_BIN" validate "$yaml" 2>&1 | head -20 || true
    FAILURES=$((FAILURES + 1))
  fi
  VALIDATED=$((VALIDATED + 1))
done

if [[ "$FAILURES" -gt 0 ]]; then
  error "$FAILURES scenario(s) failed validation"
  exit 1
fi

log "Phase 2 complete: $VALIDATED scenarios validated"
