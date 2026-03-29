#!/usr/bin/env python3
"""Phase 6b: Process protocol traces.

Reads ThoughtJack .trace.jsonl files for each model x scenario,
computes shared prefix / fork point / run grouping, and writes
pre-processed trace JSON for the website.
"""

import json
import sys
from pathlib import Path

KILL_CHAIN_STAGES = ["delivery", "injection", "decision", "action", "impact"]

# Map worst-case tier to kill chain stage
TIER_TO_STAGE = {
    0: "delivery",
    1: "injection",
    2: "action",
    3: "impact",
}


def parse_jsonl(path):
    """Parse a JSONL trace file into a list of event dicts."""
    events = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                events.append(json.loads(line))
    return events


def event_key(event):
    """Return a comparison key for an event (excludes seq and timestamp)."""
    return json.dumps(
        {
            "actor": event.get("actor"),
            "phase": event.get("phase"),
            "direction": event.get("direction"),
            "method": event.get("method"),
            "content": event.get("content"),
        },
        sort_keys=True,
    )


def find_fork_point(runs):
    """Find the index of the first event that differs across runs.

    Returns the number of shared events (i.e., the fork index).
    All events before this index are identical across all runs.
    """
    if not runs:
        return 0

    min_len = min(len(r) for r in runs)
    for i in range(min_len):
        keys = {event_key(r[i]) for r in runs}
        if len(keys) > 1:
            return i
    return min_len


def group_runs(runs, fork_index, tiers):
    """Group runs with identical post-fork traces.

    Returns a list of groups, each with run_indices, tiers, worst_tier,
    kill_chain_stage, and events.
    """
    groups = {}
    for run_idx, run_events in enumerate(runs):
        post_fork = run_events[fork_index:]
        # Create a hashable key from the post-fork events
        group_key = json.dumps(
            [event_key(e) for e in post_fork], sort_keys=True
        )
        if group_key not in groups:
            groups[group_key] = {
                "run_indices": [],
                "tiers": [],
                "events": post_fork,
            }
        groups[group_key]["run_indices"].append(run_idx)
        tier = tiers[run_idx] if run_idx < len(tiers) else 0
        groups[group_key]["tiers"].append(tier)

    result = []
    for group in groups.values():
        worst_tier = max(group["tiers"]) if group["tiers"] else 0
        # Strip seq/timestamp from events to reduce size
        clean_events = []
        for e in group["events"]:
            clean_events.append({
                "actor": e.get("actor", ""),
                "phase": e.get("phase", ""),
                "direction": e.get("direction", ""),
                "method": e.get("method", ""),
                "content": e.get("content"),
            })
        result.append({
            "run_indices": group["run_indices"],
            "tiers": group["tiers"],
            "worst_tier": worst_tier,
            "kill_chain_stage": TIER_TO_STAGE.get(worst_tier, "delivery"),
            "events": clean_events,
        })

    # Sort worst-first
    result.sort(key=lambda g: -g["worst_tier"])
    return result


def extract_actors(runs):
    """Extract unique actor names in order of first appearance."""
    seen = set()
    actors = []
    for run_events in runs:
        for e in run_events:
            actor = e.get("actor", "")
            if actor and actor not in seen:
                seen.add(actor)
                actors.append(actor)
    return actors


def process_scenario(trace_paths, tiers):
    """Process traces for one scenario across all runs.

    Args:
        trace_paths: list of Path objects for each run's .trace.jsonl
        tiers: list of tier values (int) per run from scored.json

    Returns a ProcessedTrace dict, or None if no traces available.
    """
    runs = []
    valid_indices = []
    for i, path in enumerate(trace_paths):
        if path.exists():
            events = parse_jsonl(path)
            if events:
                runs.append(events)
                valid_indices.append(i)

    if not runs:
        return None

    # Remap tiers to only include valid runs
    valid_tiers = [tiers[i] if i < len(tiers) else 0 for i in valid_indices]

    fork_index = find_fork_point(runs)
    actors = extract_actors(runs)

    # Shared prefix: strip seq/timestamp to reduce size
    shared_prefix = []
    if runs:
        for e in runs[0][:fork_index]:
            shared_prefix.append({
                "actor": e.get("actor", ""),
                "phase": e.get("phase", ""),
                "direction": e.get("direction", ""),
                "method": e.get("method", ""),
                "content": e.get("content"),
            })

    groups = group_runs(runs, fork_index, valid_tiers)

    return {
        "actors": actors,
        "shared_prefix": shared_prefix,
        "fork_index": fork_index,
        "groups": groups,
    }


def main():
    if len(sys.argv) < 3:
        print("Usage: phase6b_traces.py <run_dir> <repo_root>", file=sys.stderr)
        sys.exit(1)

    run_dir = Path(sys.argv[1])
    repo_root = Path(sys.argv[2])

    # Load scored.json to get scenario list and tiers per model
    scored_path = run_dir / "scored.json"
    if not scored_path.exists():
        print(f"WARN: scored.json not found at {scored_path}, skipping trace processing", file=sys.stderr)
        return

    scored = json.loads(scored_path.read_text())
    runs_per = scored["metadata"].get("runs_per_scenario", 5)

    traces_written = 0
    traces_skipped = 0

    for model in scored["models"]:
        model_id = model["id"]
        results_dir = run_dir / "results" / model_id
        traces_out_dir = run_dir / "traces" / model_id
        traces_out_dir.mkdir(parents=True, exist_ok=True)

        # Process attack scenarios
        for scenario in model.get("scenarios", []):
            sid = scenario["id"]
            tiers = scenario.get("runs", [])

            trace_paths = [
                results_dir / f"{sid}_run{i+1}.trace.jsonl"
                for i in range(runs_per)
            ]

            processed = process_scenario(trace_paths, tiers)
            if processed is None:
                traces_skipped += 1
                continue

            processed["scenario_id"] = sid
            out_path = traces_out_dir / f"{sid}.json"
            out_path.write_text(json.dumps(processed, separators=(",", ":")))
            traces_written += 1

        # Process utility scenarios
        for scenario in model.get("utility_scenarios", []):
            sid = scenario["id"]
            # Utility runs are boolean, map to 0/1 tiers for grouping
            tiers = [0 if passed else 1 for passed in scenario.get("runs", [])]

            trace_paths = [
                run_dir / "utility-results" / model_id / f"{sid}_run{i+1}.trace.jsonl"
                for i in range(runs_per)
            ]

            processed = process_scenario(trace_paths, tiers)
            if processed is None:
                traces_skipped += 1
                continue

            processed["scenario_id"] = sid
            out_path = traces_out_dir / f"{sid}.json"
            out_path.write_text(json.dumps(processed, separators=(",", ":")))
            traces_written += 1

    ts = __import__("datetime").datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] Traces processed: {traces_written} written, {traces_skipped} skipped (no trace files)")


if __name__ == "__main__":
    main()
