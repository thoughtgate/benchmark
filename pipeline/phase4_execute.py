#!/usr/bin/env python3
"""Phase 4: Execute benchmark scenarios.

Runs ThoughtJack against all models × scenarios with:
- Async parallel execution per provider (configurable concurrency)
- Inter-run and inter-model delays for rate limiting
- Automatic retry of failed runs with exponential backoff
- Adaptive concurrency reduction on error bursts
- Resume support (skips existing results)
- Progress reporting
"""

import asyncio
import json
import os
import shlex
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import yaml

# ---------------------------------------------------------------------------
# Exit code mapping (mirrors ThoughtJack ExitCode)
# ---------------------------------------------------------------------------

TIER_NAMES = {0: "T0", 1: "T1", 2: "T2", 3: "T3", 4: "PARTIAL", 5: "ERROR", 10: "RUNTIME_ERROR"}
RETRYABLE_EXIT_CODES = {5, 10}  # ERROR (API errors) and RUNTIME_ERROR (transport)
MAX_RETRIES = 2
RETRY_BASE_DELAY = 5.0  # seconds, doubles each retry

# Adaptive rate limiting: reduce concurrency after this many errors in a window
ERROR_BURST_THRESHOLD = 5
ERROR_BURST_WINDOW = 30  # seconds


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class RunConfig:
    tj_bin: str
    runs_per: int
    max_session: str
    max_turns: int
    context_timeout: int
    no_retry_errors: bool
    scenario_filter: str


@dataclass
class ModelConfig:
    id: str
    display_name: str
    provider: str
    model_type: str
    context_args: str
    api_key: str
    temperature: float


@dataclass
class RunTask:
    scenario_yaml: str
    output_path: str
    trace_path: str
    model_id: str
    scenario_id: str
    run_num: int
    results_dir: str  # "results" or "utility-results"
    context_args: str = ""
    api_key: str = ""
    temperature: float = 0.0


@dataclass
class RunResult:
    model_id: str
    scenario_id: str
    run_num: int
    status: str  # COMPLETED, ERROR, INCONCLUSIVE, SKIPPED, RETRY
    tier_str: str
    elapsed: float
    retry_count: int = 0


@dataclass
class ProviderState:
    """Tracks error rate for adaptive concurrency."""
    recent_errors: list = field(default_factory=list)  # timestamps of recent errors
    concurrency_reduced: bool = False
    original_max_parallel: int = 5


# ---------------------------------------------------------------------------
# Core execution
# ---------------------------------------------------------------------------

async def run_one(cfg: RunConfig, task: RunTask, semaphore: asyncio.Semaphore) -> RunResult:
    """Execute a single ThoughtJack run."""
    start = time.monotonic()
    os.makedirs(os.path.dirname(task.output_path), exist_ok=True)

    # Parse context_args — these are space-separated flags from config.yaml
    # that need to be passed as individual arguments
    model_cfg_args = shlex.split(task.context_args) if task.context_args else []

    cmd = [
        cfg.tj_bin, "run",
        task.scenario_yaml,
        "--context",
        *model_cfg_args,
        "--context-api-key", task.api_key,
        "--context-temperature", str(task.temperature),
        "--max-session", cfg.max_session,
        "--max-turns", str(cfg.max_turns),
        "--context-timeout", str(cfg.context_timeout),
        "--no-semantic",
        "--export-trace", task.trace_path,
        "-o", task.output_path,
    ]

    async with semaphore:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()

    elapsed = time.monotonic() - start
    exit_code = proc.returncode or 0

    # Classify result
    if 0 <= exit_code <= 4:
        if not os.path.exists(task.output_path):
            _write_error(task, exit_code, "No output file produced")
            _remove_if_exists(task.trace_path)
            return RunResult(task.model_id, task.scenario_id, task.run_num, "ERROR", "ERROR", elapsed)

        # Check for zero trace messages (inconclusive)
        try:
            with open(task.output_path) as f:
                result_data = json.load(f)
            trace_msgs = result_data.get("execution_summary", {}).get("trace_messages", 0)
        except (json.JSONDecodeError, OSError):
            trace_msgs = 0

        if trace_msgs == 0:
            _rename_to_inconclusive(task)
            return RunResult(task.model_id, task.scenario_id, task.run_num, "INCONCLUSIVE", "INCONCLUSIVE", elapsed)

        tier_str = TIER_NAMES.get(exit_code, "UNKNOWN")
        return RunResult(task.model_id, task.scenario_id, task.run_num, "COMPLETED", tier_str, elapsed)

    else:
        _write_error(task, exit_code)
        _remove_if_exists(task.output_path)
        _remove_if_exists(task.trace_path)
        tier_str = TIER_NAMES.get(exit_code, f"EXIT_{exit_code}")
        return RunResult(task.model_id, task.scenario_id, task.run_num, "ERROR", tier_str, elapsed)


def _write_error(task: RunTask, exit_code: int, msg: str | None = None):
    error_path = task.output_path.replace(".json", ".ERROR.json")
    data = {
        "error": msg or f"Exit code {exit_code}",
        "exit_code": exit_code,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    try:
        with open(error_path, "w") as f:
            json.dump(data, f)
    except OSError:
        pass


def _rename_to_inconclusive(task: RunTask):
    inc_path = task.output_path.replace(".json", ".INCONCLUSIVE.json")
    try:
        os.rename(task.output_path, inc_path)
    except OSError:
        pass
    trace_inc = task.trace_path.replace(".trace.jsonl", ".INCONCLUSIVE.trace.jsonl")
    if os.path.exists(task.trace_path):
        try:
            os.rename(task.trace_path, trace_inc)
        except OSError:
            pass


def _remove_if_exists(path: str):
    try:
        os.remove(path)
    except OSError:
        pass


def _clear_error_file(task: RunTask):
    """Remove an existing .ERROR.json so a retry can proceed."""
    error_path = task.output_path.replace(".json", ".ERROR.json")
    _remove_if_exists(error_path)


# ---------------------------------------------------------------------------
# Run completion check (resume support)
# ---------------------------------------------------------------------------

def is_run_complete(task: RunTask, no_retry_errors: bool) -> bool:
    base = task.output_path.replace(".json", "")
    if os.path.exists(f"{base}.json"):
        return True
    if os.path.exists(f"{base}.INCONCLUSIVE.json"):
        return True
    if os.path.exists(f"{base}.ERROR.json"):
        if no_retry_errors:
            return True
        # Will be retried — remove stale error file
        _remove_if_exists(f"{base}.ERROR.json")
        return False
    return False


# ---------------------------------------------------------------------------
# Retry logic
# ---------------------------------------------------------------------------

async def run_with_retry(
    cfg: RunConfig,
    task: RunTask,
    semaphore: asyncio.Semaphore,
    provider_state: ProviderState,
) -> RunResult:
    """Run a task with retry on retryable errors."""
    result = await run_one(cfg, task, semaphore)

    if result.status == "ERROR":
        # Track error for adaptive rate limiting
        provider_state.recent_errors.append(time.monotonic())

    retries = 0
    while (
        result.status == "ERROR"
        and retries < MAX_RETRIES
        and _is_retryable(task)
    ):
        retries += 1
        delay = RETRY_BASE_DELAY * (2 ** (retries - 1))

        # Clear the error file before retrying
        _clear_error_file(task)

        await asyncio.sleep(delay)
        result = await run_one(cfg, task, semaphore)
        result.retry_count = retries

        if result.status == "ERROR":
            provider_state.recent_errors.append(time.monotonic())

    return result


def _is_retryable(task: RunTask) -> bool:
    """Check if the error file indicates a retryable exit code."""
    error_path = task.output_path.replace(".json", ".ERROR.json")
    try:
        with open(error_path) as f:
            data = json.load(f)
        return data.get("exit_code", 0) in RETRYABLE_EXIT_CODES
    except (OSError, json.JSONDecodeError):
        return False


def _should_reduce_concurrency(state: ProviderState) -> bool:
    """Check if recent errors warrant reducing concurrency."""
    now = time.monotonic()
    # Prune old errors
    state.recent_errors = [t for t in state.recent_errors if now - t < ERROR_BURST_WINDOW]
    return len(state.recent_errors) >= ERROR_BURST_THRESHOLD


# ---------------------------------------------------------------------------
# Model execution
# ---------------------------------------------------------------------------

async def execute_model(
    cfg: RunConfig,
    model: ModelConfig,
    run_dir: Path,
    attack_ids: list[str],
    utility_ids: list[str],
    rate_limits: dict,
    counter: dict,
):
    """Execute all scenarios for a single model."""
    max_parallel = rate_limits.get("max_parallel", 5)
    inter_run_delay_ms = rate_limits.get("inter_run_delay_ms", 200)

    provider_state = ProviderState(original_max_parallel=max_parallel)
    semaphore = asyncio.Semaphore(max_parallel)

    # Build task list
    tasks: list[RunTask] = []

    for scenario_id in attack_ids:
        for run_num in range(1, cfg.runs_per + 1):
            output_path = str(run_dir / "results" / model.id / f"{scenario_id}_run{run_num}.json")
            trace_path = output_path.replace(".json", ".trace.jsonl")
            t = RunTask(
                scenario_yaml=str(run_dir / "scenarios" / f"{scenario_id}.yaml"),
                output_path=output_path,
                trace_path=trace_path,
                model_id=model.id,
                scenario_id=scenario_id,
                run_num=run_num,
                results_dir="results",
                context_args=model.context_args,
                api_key=model.api_key,
                temperature=model.temperature,
            )
            tasks.append(t)

    for scenario_id in utility_ids:
        for run_num in range(1, cfg.runs_per + 1):
            output_path = str(run_dir / "utility-results" / model.id / f"{scenario_id}_run{run_num}.json")
            trace_path = output_path.replace(".json", ".trace.jsonl")
            t = RunTask(
                scenario_yaml=str(run_dir / "utility" / f"{scenario_id}.yaml"),
                output_path=output_path,
                trace_path=trace_path,
                model_id=model.id,
                scenario_id=scenario_id,
                run_num=run_num,
                results_dir="utility-results",
                context_args=model.context_args,
                api_key=model.api_key,
                temperature=model.temperature,
            )
            tasks.append(t)

    # Filter to incomplete tasks
    pending = []
    for t in tasks:
        if is_run_complete(t, cfg.no_retry_errors):
            counter["skipped"] += 1
            counter["done"] += 1
        else:
            pending.append(t)

    if not pending:
        return

    # Execute with controlled concurrency
    async def run_task(task: RunTask):
        # Adaptive rate limiting: reduce concurrency if errors are bursting
        if not provider_state.concurrency_reduced and _should_reduce_concurrency(provider_state):
            new_limit = max(1, max_parallel // 2)
            provider_state.concurrency_reduced = True
            # We can't resize a Semaphore, but we can slow down dispatching
            log(f"  Reducing effective concurrency for {model.id} (error burst detected)")

        result = await run_with_retry(cfg, task, semaphore, provider_state)

        counter["done"] += 1
        if result.status == "COMPLETED":
            counter["completed"] += 1
        elif result.status == "ERROR":
            counter["errors"] += 1
        elif result.status == "INCONCLUSIVE":
            counter["inconclusive"] += 1

        retry_note = f" (retry {result.retry_count})" if result.retry_count > 0 else ""
        print(
            f"[{counter['done']}/{counter['total']}] "
            f"{result.model_id} \u00d7 {result.scenario_id} run {result.run_num}: "
            f"{result.tier_str} ({result.elapsed:.0f}s){retry_note}"
        )

    # Dispatch all tasks concurrently (semaphore limits actual parallelism)
    coros = []
    for t in pending:
        coros.append(run_task(t))
        # Small stagger to avoid thundering herd at startup
        if inter_run_delay_ms > 0 and len(coros) <= max_parallel:
            await asyncio.sleep(inter_run_delay_ms / 1000)

    await asyncio.gather(*coros)


# ---------------------------------------------------------------------------
# Progress
# ---------------------------------------------------------------------------

def write_progress(run_dir: Path, counter: dict, start_time: float):
    elapsed = int(time.monotonic() - start_time)
    done = counter["done"]
    total = counter["total"]
    remaining = total - done
    est_remaining = int(elapsed * remaining / done) if done > 0 and elapsed > 0 else 0

    progress = {
        "total_expected": total,
        "completed": counter["completed"],
        "errors": counter["errors"],
        "inconclusive": counter["inconclusive"],
        "skipped": counter["skipped"],
        "elapsed_seconds": elapsed,
        "estimated_remaining_seconds": est_remaining,
    }
    with open(run_dir / "progress.json", "w") as f:
        json.dump(progress, f, indent=2)


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

def log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def async_main(run_dir: Path, repo_root: Path):
    config = yaml.safe_load(open(repo_root / "config.yaml"))
    manifest = yaml.safe_load(open(repo_root / "manifest.yaml"))

    # ThoughtJack binary
    tj_bin = os.environ.get("THOUGHTJACK_BINARY", config["thoughtjack"]["binary"])

    # Run configuration
    run_cfg = RunConfig(
        tj_bin=tj_bin,
        runs_per=config["run"]["runs_per_scenario"],
        max_session=str(config["run"]["max_session"]),
        max_turns=config["run"]["max_turns"],
        context_timeout=config["run"]["context_timeout"],
        no_retry_errors=os.environ.get("NO_RETRY_ERRORS", "false").lower() == "true",
        scenario_filter=os.environ.get("SCENARIO_FILTER", ""),
    )

    # Build model list (apply filters)
    model_filter = os.environ.get("MODEL_FILTER", "")
    provider_filter = os.environ.get("PROVIDER_FILTER", "")
    models: list[ModelConfig] = []
    for m in config["models"]:
        if model_filter and m["id"] != model_filter:
            continue
        if provider_filter and m["provider"] != provider_filter:
            continue

        api_key_env = m["api_key_env"]
        api_key = os.environ.get(api_key_env, "")
        if not api_key:
            log(f"WARNING: {api_key_env} not set for {m['id']}, skipping")
            continue

        model_type = m["type"]
        temp = config["run"].get("temperature_reasoning", 1.0) if model_type in ("reasoning", "hybrid") else config["run"].get("temperature_default", 0)

        models.append(ModelConfig(
            id=m["id"],
            display_name=m["display_name"],
            provider=m["provider"],
            model_type=model_type,
            context_args=m.get("context_args", ""),
            api_key=api_key,
            temperature=temp,
        ))

    # Build scenario ID lists
    attack_ids = [s["id"] for s in manifest["scenarios"].get("primaries", [])]
    attack_ids += [s["id"] for s in manifest["scenarios"].get("variants", [])]
    utility_ids = [s["id"] for s in manifest.get("utility", {}).get("scenarios", [])]

    if run_cfg.scenario_filter:
        attack_ids = [s for s in attack_ids if s == run_cfg.scenario_filter]
        utility_ids = [s for s in utility_ids if s == run_cfg.scenario_filter]

    # Compute totals
    total_runs = (len(attack_ids) + len(utility_ids)) * len(models) * run_cfg.runs_per
    counter = {
        "total": total_runs,
        "done": 0,
        "completed": 0,
        "errors": 0,
        "inconclusive": 0,
        "skipped": 0,
    }

    log(f"Expected total runs: {total_runs} ({len(models)} models \u00d7 {run_cfg.runs_per} runs)")

    start_time = time.monotonic()

    # Group models by provider for concurrent cross-provider execution
    from collections import defaultdict
    by_provider: dict[str, list[ModelConfig]] = defaultdict(list)
    for model in models:
        by_provider[model.provider].append(model)

    providers = sorted(by_provider.keys())
    log(f"Providers: {', '.join(f'{p} ({len(by_provider[p])} models)' for p in providers)}")

    async def run_provider(provider: str, provider_models: list[ModelConfig]):
        """Run all models for a single provider sequentially (rate-limited)."""
        rate_limits = config.get("rate_limits", {}).get(provider, {})
        inter_model_delay_ms = rate_limits.get("inter_model_delay_ms", 2000)
        max_parallel = rate_limits.get("max_parallel", 5)

        for i, model in enumerate(provider_models):
            if i > 0:
                await asyncio.sleep(inter_model_delay_ms / 1000)

            log(f"Starting model: {model.id} ({provider}, {max_parallel}x parallel)")
            await execute_model(run_cfg, model, run_dir, attack_ids, utility_ids, rate_limits, counter)
            write_progress(run_dir, counter, start_time)
            log(f"Completed model: {model.id}")

    # Run all providers concurrently
    await asyncio.gather(*(run_provider(p, by_provider[p]) for p in providers))

    write_progress(run_dir, counter, start_time)
    log(
        f"Phase 4 complete: {counter['completed']} succeeded, "
        f"{counter['errors']} errors, {counter['inconclusive']} inconclusive, "
        f"{counter['skipped']} skipped"
    )

    # Post-execution completeness check
    if counter["errors"] > 0:
        error_rate = counter["errors"] / counter["total"] * 100
        log(f"WARNING: {counter['errors']} runs failed ({error_rate:.1f}% error rate)")
        if error_rate > 10:
            log("ERROR RATE >10%: Consider re-running with --resume to retry failed runs")


def main():
    if len(sys.argv) < 3:
        print("Usage: phase4_execute.py <run_dir> <repo_root>", file=sys.stderr)
        sys.exit(1)

    run_dir = Path(sys.argv[1])
    repo_root = Path(sys.argv[2])
    asyncio.run(async_main(run_dir, repo_root))


if __name__ == "__main__":
    main()
