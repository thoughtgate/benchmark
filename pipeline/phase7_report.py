#!/usr/bin/env python3
"""Phase 7: Generate report.

Reads scored.json and metadata, produces:
  - report.md: full benchmark report
  - findings.md: 2-3 headline findings for the website
  - updates runs/manifest.json: global run index
"""

import json
import sys
from datetime import datetime
from pathlib import Path


def load_json(path):
    with open(path) as f:
        return json.load(f)


def generate_report(scored, metadata, integrity, previous_scored=None):
    """Generate the full report markdown."""
    models = sorted(scored["models"], key=lambda m: -m["aggregate"])
    lines = []

    lines.append(f"# ThoughtJack Benchmark — {metadata['date']}")
    lines.append("")

    # --- Results table ---
    lines.append("## Results")
    lines.append("")
    lines.append("| Rank | Model | Type | Resistance | Utility |")
    lines.append("|------|-------|------|-----------|---------|")
    for i, m in enumerate(models, 1):
        lines.append(
            f"| {i} | {m['display_name']} | {m['type']} | {m['aggregate']:.1f} | {m['utility_score']:.1f} |"
        )
    lines.append("")

    # --- Category breakdown ---
    lines.append("## Category Scores")
    lines.append("")

    # Header row
    cat_names = [c["name"] for c in models[0]["categories"]] if models else []
    header = "| Model | " + " | ".join(cat_names) + " |"
    separator = "|-------|" + "|".join(["--------"] * len(cat_names)) + "|"
    lines.append(header)
    lines.append(separator)
    for m in models:
        scores = " | ".join(f"{c['score']:.1f}" for c in m["categories"])
        lines.append(f"| {m['display_name']} | {scores} |")
    lines.append("")

    # --- Universal exploits ---
    lines.append("## Universal Exploits")
    lines.append("")
    lines.append("Scenarios where every model reached the maximum tier:")
    lines.append("")

    universal = []
    if models:
        all_scenario_ids = {s["id"] for s in models[0]["scenarios"]}
        for sid in sorted(all_scenario_ids):
            max_tier = None
            all_at_max = True
            for m in models:
                for s in m["scenarios"]:
                    if s["id"] == sid:
                        if max_tier is None:
                            max_tier = s["max_tier"]
                        if s["worst_case_tier"] < s["max_tier"]:
                            all_at_max = False
                        break
            if all_at_max and max_tier and max_tier > 0:
                name = next(
                    (s["name"] for m in models for s in m["scenarios"] if s["id"] == sid),
                    sid,
                )
                universal.append(f"- **{sid}**: {name} (T{max_tier})")

    if universal:
        lines.extend(universal)
    else:
        lines.append("None — at least one model blocked every scenario.")
    lines.append("")

    # --- Reasoning comparison ---
    lines.append("## Reasoning vs Standard Models")
    lines.append("")
    reasoning = [m for m in models if m["type"] in ("reasoning", "hybrid")]
    standard = [m for m in models if m["type"] == "standard"]

    if reasoning and standard:
        avg_reasoning = sum(m["aggregate"] for m in reasoning) / len(reasoning)
        avg_standard = sum(m["aggregate"] for m in standard) / len(standard)
        delta = avg_reasoning - avg_standard
        direction = "higher" if delta > 0 else "lower"
        lines.append(
            f"Reasoning/hybrid models average **{avg_reasoning:.1f}** vs standard **{avg_standard:.1f}** "
            f"({abs(delta):.1f} points {direction})."
        )
    else:
        lines.append("Insufficient model types for comparison.")
    lines.append("")

    # --- Utility results ---
    lines.append("## Utility Scores")
    lines.append("")
    lines.append("| Model | Utility | Details |")
    lines.append("|-------|---------|---------|")
    for m in models:
        details = ", ".join(
            f"{u['id']}: {u['pass_rate']:.0%}" for u in m["utility_scenarios"]
        )
        lines.append(f"| {m['display_name']} | {m['utility_score']:.1f} | {details} |")
    lines.append("")

    # --- Historical comparison ---
    if previous_scored:
        lines.append("## Changes from Previous Run")
        lines.append("")
        prev_models = {m["id"]: m for m in previous_scored.get("models", [])}
        changes = []
        for m in models:
            prev = prev_models.get(m["id"])
            if prev:
                delta = m["aggregate"] - prev["aggregate"]
                if abs(delta) >= 0.5:
                    arrow = "+" if delta > 0 else ""
                    changes.append(
                        f"- **{m['display_name']}**: {prev['aggregate']:.1f} → {m['aggregate']:.1f} ({arrow}{delta:.1f})"
                    )
        if changes:
            lines.extend(changes)
        else:
            lines.append("No significant score changes.")
        lines.append("")

    # --- Integrity summary ---
    lines.append("## Integrity")
    lines.append("")
    if integrity:
        lines.append(f"Overall: **{integrity.get('overall', 'unknown')}**")
        for w in integrity.get("warnings", []):
            lines.append(f"- {w}")
    lines.append("")

    # --- Metadata ---
    lines.append("## Run Metadata")
    lines.append("")
    lines.append(f"- **Date**: {metadata.get('date')}")
    lines.append(f"- **ThoughtJack**: v{metadata.get('thoughtjack_version')}")
    lines.append(f"- **Scenario commit**: {metadata.get('scenario_commit')}")
    lines.append(f"- **Benchmark commit**: {metadata.get('benchmark_commit')}")
    lines.append(f"- **Models**: {metadata.get('model_count')}")
    lines.append(
        f"- **Scenarios**: {metadata.get('attack_scenario_count')} attack + {metadata.get('utility_scenario_count')} utility"
    )
    lines.append(f"- **Runs per scenario**: {metadata.get('runs_per_scenario')}")
    lines.append("")

    return "\n".join(lines)


def generate_findings(scored, previous_scored=None):
    """Generate 2-3 headline findings."""
    models = sorted(scored["models"], key=lambda m: -m["aggregate"])
    findings = []

    if not models:
        return "No models scored.\n"

    # Finding 1: Highest exploit rate scenario
    worst_scenario = None
    worst_exploit_count = 0
    for s in models[0]["scenarios"]:
        exploited_count = sum(
            1
            for m in models
            for ms in m["scenarios"]
            if ms["id"] == s["id"] and ms["worst_case_tier"] >= ms["max_tier"]
        )
        if exploited_count > worst_exploit_count:
            worst_exploit_count = exploited_count
            worst_scenario = s

    if worst_scenario:
        findings.append(
            f"**{worst_scenario['id']}** ({worst_scenario['name']}) exploited {worst_exploit_count}/{len(models)} models at maximum tier."
        )

    # Finding 2: Reasoning vs standard delta (exclude hybrid — doesn't belong in either group)
    reasoning = [m for m in models if m["type"] == "reasoning"]
    standard = [m for m in models if m["type"] == "standard"]
    if reasoning and standard:
        avg_r = sum(m["aggregate"] for m in reasoning) / len(reasoning)
        avg_s = sum(m["aggregate"] for m in standard) / len(standard)
        delta = avg_r - avg_s
        if abs(delta) >= 2:
            direction = "outperform" if delta > 0 else "underperform"
            findings.append(
                f"Reasoning models {direction} standard models by {abs(delta):.1f} points on attack resistance."
            )

    # Finding 3: Safety-utility tradeoff
    for m in models:
        if m["aggregate"] >= 70 and m["utility_score"] < 60:
            findings.append(
                f"**{m['display_name']}** shows a safety-utility tradeoff: {m['aggregate']:.1f} resistance but only {m['utility_score']:.1f} utility."
            )
            break

    # Finding 4: Score changes vs previous
    if previous_scored:
        prev_models = {m["id"]: m for m in previous_scored.get("models", [])}
        biggest_change = None
        biggest_delta = 0
        for m in models:
            prev = prev_models.get(m["id"])
            if prev:
                # Skip comparison if previous run had insufficient data
                prev_with_data = sum(1 for s in prev.get("scenarios", []) if s.get("runs"))
                prev_total = len(prev.get("scenarios", []))
                if prev_total > 0 and prev_with_data / prev_total < 0.5:
                    continue
                delta = m["aggregate"] - prev["aggregate"]
                if abs(delta) > abs(biggest_delta):
                    biggest_delta = delta
                    biggest_change = m
        if biggest_change and abs(biggest_delta) >= 3:
            direction = "improved" if biggest_delta > 0 else "regressed"
            findings.append(
                f"**{biggest_change['display_name']}** {direction} by {abs(biggest_delta):.1f} points since the previous run."
            )

    return "\n\n".join(findings) + "\n"


def update_run_manifest(runs_dir, metadata, scored):
    """Update runs/manifest.json with this run entry."""
    manifest_path = runs_dir / "manifest.json"

    if manifest_path.exists():
        run_manifest = load_json(manifest_path)
    else:
        run_manifest = {"latest": "", "runs": []}

    run_manifest["latest"] = metadata["date"]
    run_manifest["runs"].append(
        {
            "date": metadata["date"],
            "scenario_set_version": scored["metadata"].get("scenario_set_version", ""),
            "model_count": metadata.get("model_count", 0),
            "scenario_count": metadata.get("attack_scenario_count", 0),
            "status": "complete",
        }
    )

    with open(manifest_path, "w") as f:
        json.dump(run_manifest, f, indent=2)


def main():
    if len(sys.argv) < 3:
        print("Usage: phase7_report.py <run_dir> <repo_root>", file=sys.stderr)
        sys.exit(1)

    run_dir = Path(sys.argv[1])
    repo_root = Path(sys.argv[2])

    scored = load_json(run_dir / "scored.json")
    metadata = load_json(run_dir / "metadata.json")

    integrity = None
    integrity_path = run_dir / "integrity.json"
    if integrity_path.exists():
        integrity = load_json(integrity_path)

    # Find previous run for comparison
    previous_scored = None
    runs_dir = repo_root / "runs"
    if runs_dir.exists():
        run_dirs = sorted(
            [d for d in runs_dir.iterdir() if d.is_dir() and d != run_dir],
            reverse=True,
        )
        for prev_dir in run_dirs:
            prev_scored_path = prev_dir / "scored.json"
            if prev_scored_path.exists():
                previous_scored = load_json(prev_scored_path)
                break

    # Generate report
    report = generate_report(scored, metadata, integrity, previous_scored)
    report_path = run_dir / "report.md"
    with open(report_path, "w") as f:
        f.write(report)
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Written {report_path}")

    # Generate findings
    findings = generate_findings(scored, previous_scored)
    findings_path = run_dir / "findings.md"
    with open(findings_path, "w") as f:
        f.write(findings)
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Written {findings_path}")

    # Update runs manifest
    runs_dir.mkdir(parents=True, exist_ok=True)
    update_run_manifest(runs_dir, metadata, scored)
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Updated {runs_dir / 'manifest.json'}")


if __name__ == "__main__":
    main()
