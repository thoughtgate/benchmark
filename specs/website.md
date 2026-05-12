# benchmark.thoughtjack.io — Website Spec

## Overview

The ThoughtJack Benchmark website publishes scored results from the ThoughtJack benchmark — a test suite of 54 adversarial scenarios run against frontier LLMs to measure their resistance to prompt injection, data exfiltration, goal hijacking, and other agent-level attacks across MCP, A2A, and AG-UI protocols.

The site has four views: the main benchmark (latest scores), the technique fingerprint (which evasion techniques work on which models), the model history (scores over time), and the run archive (raw data for every past run).

---

## Tech stack

- **Next.js 15** with static export (`output: 'export'`)
- **React** for interactive components (technique fingerprint filters, model comparison)
- **Tailwind CSS** matching thoughtjack.io's Docusaurus theme (colours, typography, spacing)
- **Recharts** for radar charts and bar charts
- **Deployed to Cloudflare Pages** (or Vercel — either works for static export)
- **Data source**: build-time fetch from the `thoughtjack-benchmark` GitHub repo's `results/` directory

No backend. No database. The site rebuilds when new results are pushed (triggered by a GitHub webhook or a manual deploy after the benchmark PR is merged).

---

## Design system

Match thoughtjack.io's Docusaurus theme:

- **Background**: white (`#ffffff`), with secondary surfaces at `#f5f6f7`
- **Text**: primary `#1c1e21`, secondary `#606770`
- **Accent**: the green from ThoughtJack's terminal aesthetic (use for positive/blocked indicators)
- **Danger**: red for exploited/T3 results
- **Warning**: amber/orange for partial/T2 results
- **Info**: blue for T1/ingested
- **Font**: system font stack matching Docusaurus default (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ...`)
- **Navigation**: top navbar matching thoughtjack.io layout — logo left, links right, with a "Back to ThoughtJack" link
- **Dark mode**: support it, matching Docusaurus dark theme

Tier colour mapping (used consistently across all views):

| Tier | Colour | Meaning |
|------|--------|---------|
| T0 | Green (`#22c55e`) | Blocked |
| T1 | Blue (`#3b82f6`) | Ingested |
| T2 | Amber (`#f59e0b`) | Acted locally |
| T3 | Red (`#ef4444`) | Boundary breach |

---

## Data schema

The site reads `scored.json` from each run directory. The pipeline produces this file; the site consumes it.

```typescript
interface BenchmarkRun {
  metadata: {
    date: string;           // ISO date, e.g. "2026-04-01"
    thoughtjack_version: string;
    scenario_set_version: string;
    scenario_commit: string; // git SHA of OATF scenario repo
    benchmark_commit: string;
    runs_per_scenario: number; // typically 5
    workflow_run_id?: string;
  };
  models: ModelResult[];
}

interface ModelResult {
  id: string;              // e.g. "claude-sonnet-4-6"
  display_name: string;    // e.g. "Claude Sonnet 4.6"
  provider: string;        // e.g. "anthropic"
  type: "standard" | "reasoning" | "hybrid";
  categories: CategoryScore[];
  aggregate: number;       // 0-100, mean of category scores (attack resistance)
  utility_score: number;   // 0-100, task completion rate (non-attack scenarios)
  scenarios: ScenarioResult[];
  utility_scenarios: UtilityResult[];
}

interface CategoryScore {
  name: string;            // e.g. "Injection Resistance"
  score: number;           // 0-100
  primary_count: number;
  variant_count: number;
}

interface ScenarioResult {
  id: string;              // e.g. "OATF-002"
  name: string;
  type: "primary" | "variant" | "pending";
  category: string;
  surface: string;         // e.g. "S2"
  technique: string;       // e.g. "E2"
  max_tier: number;        // 2 or 3 — computed from highest indicator tier in scenario YAML
  worst_case_tier: number; // 0-3 (highest across 5 runs)
  typical_tier: number;    // 0-3 (median across 5 runs)
  consistency: string;     // e.g. "5/5", "3/5"
  runs: number[];          // e.g. [3, 3, 3, 0, 3] — tier per run
}

interface UtilityResult {
  id: string;              // e.g. "UTIL-001"
  name: string;
  task: string;            // e.g. "Send an email to a colleague"
  pass_rate: number;       // 0-1, fraction of runs that completed the task
  runs: boolean[];         // e.g. [true, true, true, false, true]
}
}
```

The site also reads `results/manifest.json` which lists all available runs:

```typescript
interface RunManifest {
  latest: string;          // date of most recent run
  runs: RunEntry[];
}

interface RunEntry {
  date: string;
  scenario_set_version: string;
  model_count: number;
  scenario_count: number;
  status: "complete" | "partial";
}
```

---

## Pages

### 1. Landing page (`/`)

The hero section. Shows the latest benchmark results at a glance.

**Content:**

- **Headline**: "ThoughtJack AI Agent Security Benchmark"
- **Subhead**: "How resistant are frontier LLMs to adversarial attacks on MCP, A2A, and AG-UI protocols? We test 54 scenarios against 20 models, every two weeks."
- **Last updated**: date from latest run metadata
- **Main benchmark table**: all models ranked by resistance score, with utility score alongside

**Benchmark table columns:**

| Rank | Model | Provider | Type | Resistance | Utility | Inj | Exfil | Priv | Instr | Info | SocEng | Avail |
|------|-------|----------|------|-----------|---------|-----|-------|------|-------|------|--------|-------|

- Rank is by resistance score (descending — higher = more resistant)
- Resistance is the aggregate attack resistance score (0-100)
- Utility is the task completion rate (0-100) — shows whether high resistance comes at the cost of refusing legitimate work
- Category columns show the per-category resistance score (0-100)
- Each cell is colour-coded on a green→red gradient (100=green, 0=red)
- Model name links to the model detail page
- Type column shows a badge: "Standard", "Reasoning", "Hybrid"
- Table is sortable by any column (click header to sort)
- Default sort: aggregate descending

**Below the table:**

- **Category radar chart**: a spider/radar chart with one line per model (top 5 shown by default, toggle others). 7 axes = 7 categories. This is the "shape of defense" visualisation from the methodology.
- **Key findings callout**: 2-3 highlighted findings from the latest run (e.g., "Tool shadowing (OATF-002) exploits all 20 models at T3", "o3 is uniquely vulnerable to system prompt extraction"). These are manually written in a `findings.md` file in the run directory.

**Navigation**: links to Technique Fingerprint, History, About/Methodology.

### 2. Technique fingerprint (`/fingerprint`)

The differentiated view. Shows which evasion techniques work on which models, grouped by delivery surface.

**Layout**: a filterable matrix.

**Rows**: delivery surfaces (S1 through S12). Each row is expandable — click to show individual scenarios on that surface.

**Columns**: evasion techniques (E1 through E13). Plus a "Model" selector at the top.

**Cells**: the tier result for that surface × technique × model combination. Colour-coded T0-T3. If multiple scenarios exist in a cell (e.g., S4×E3 has three scenarios with different attack goals), show the worst-case tier with a count badge ("3 scenarios").

**Filters:**

- Model multi-select: choose which models to compare (default: top 5)
- Category filter: show only scenarios in a specific category
- Tier filter: highlight cells at or above a threshold (e.g., "show only T2+")

**On cell click**: expand to show the individual scenarios in that cell with per-model results.

**Insight panel** (sidebar or below matrix): auto-generated text summarising the visible data. E.g., "E3 (error framing) achieves T3 on 4 of 5 selected models across S4 and S5. Only o3 blocks it on S5 but is exploited on S4×E3 via cross-protocol pivot."

### 3. Model detail (`/model/[id]`)

One page per model. Shows everything about that model's performance.

**Sections:**

**Header**: model name, provider, type badge, aggregate score (large), last tested date.

**Category breakdown**: horizontal bar chart showing 7 category scores. Colour-coded. Each bar is clickable → scrolls to the scenario table filtered to that category.

**Scenario table**: all 54 scenarios with results for this model.

| Scenario | Category | Surface | Technique | Worst | Typical | Consistency | Type |
|----------|----------|---------|-----------|-------|---------|-------------|------|

- Worst and Typical columns show tier badges (T0 green, T1 blue, T2 amber, T3 red)
- Consistency shows the fraction (e.g., "5/5")
- Type shows Primary or Variant badge
- Sortable by any column
- Filterable by category, surface, technique, tier
- Scenario name links to oatf.dev (e.g., `https://oatf.dev/OATF-002/`)

**History chart** (if multiple runs exist): line chart showing this model's aggregate score and category scores over time. X-axis = run date. Y-axis = score 0-100. One line per category + aggregate. This is the "is the model getting better or worse?" view.

**Comparison callout**: "Compare with..." dropdown that adds a second model's data to all charts and tables for side-by-side viewing.

### 4. Run archive (`/runs`)

Lists all historical runs with links to their data.

| Date | Scenario set | Models | Scenarios | Status | Data |
|------|-------------|--------|-----------|--------|------|

- Date links to a run detail page (`/runs/[date]`)
- Data column has download links: `scored.json`, `raw.jsonl`, `report.md`

**Run detail page** (`/runs/[date]`): shows the full benchmark table for that specific run, the metadata (ThoughtJack version, scenario commit, workflow run ID linking to GitHub Actions), and the key findings.

### 5. About / Methodology (`/about`)

Static page explaining the benchmark.

**Sections:**

- What the benchmark measures (tier model, category scoring, primary/variant weighting)
- How scenarios are selected (link to scenario set spec, link to oatf.dev)
- How scoring works (the formula, link to full methodology doc)
- How to reproduce results (link to GitHub repo, instructions for forking and running with own API keys)
- Model selection criteria (why these 20 models, the safety architecture rationale)
- Limitations (context mode only, non-determinism, model versioning)
- Link to ThoughtJack for running your own tests
- Link to OATF for the scenario format

---

## Interactive features

### Model comparison

On the landing page and fingerprint view, users can select 2-3 models for side-by-side comparison. This highlights their rows in the table and overlays their lines on the radar chart. URL updates with query params so comparisons are shareable: `/fingerprint?models=claude-sonnet-4-6,o3,gpt-5.4`

### Scenario deep-link

Every scenario result is linkable. `/model/claude-sonnet-4-6#OATF-002` scrolls to and highlights that scenario's row. Useful for sharing specific findings.

### Tier threshold filter

A global toggle: "Show only vulnerable results (T2+)". This greys out all T0 and T1 cells across the site, highlighting only the scenarios where models actually acted on or completed the attack. Useful for practitioners who want to see "where are the real risks?"

---

## Build and deployment

### Build-time data fetching

In `next.config.js`, the build process fetches the `results/` directory from the benchmark GitHub repo:

1. Fetch `results/manifest.json` to get the list of runs
2. For the latest run, fetch `scored.json`
3. For all runs, fetch metadata (for the history view)
4. Generate static pages for each model, each run, and the index

The GitHub repo is public, so no auth needed for fetching. Use the GitHub raw content URL or the API.

### Rebuild trigger

When a benchmark PR is merged (new results committed), a GitHub Actions workflow in the benchmark repo triggers a deploy webhook on Cloudflare Pages / Vercel. The site rebuilds with the new data. This means the site updates within minutes of results being approved.

### SEO

Each page has appropriate meta tags:
- Landing: "ThoughtJack AI Agent Security Benchmark — LLM resistance to adversarial attacks"
- Model: "[Model Name] Security Score — ThoughtJack Benchmark"
- Fingerprint: "Evasion Technique Fingerprint — Which attacks work on which LLMs?"

Include Open Graph images for social sharing — auto-generated cards showing the model's radar chart or aggregate score.

---

## What NOT to build in v1

- **User accounts or authentication** — everything is public
- **Real-time updates** — the site is static, rebuilt on new results
- **Custom scenario submission** — this is a curated benchmark, not a platform
- **Model provider integrations** — the site displays results, it doesn't run tests
- **Comments or discussion** — link to GitHub Discussions instead
- **PDF/report export** — the raw data is downloadable from the run archive

---

## File structure

```
benchmark.thoughtjack.io/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Landing / benchmark table
│   │   ├── fingerprint/page.tsx        # Technique fingerprint matrix
│   │   ├── model/[id]/page.tsx         # Model detail
│   │   ├── runs/page.tsx               # Run archive list
│   │   ├── runs/[date]/page.tsx        # Specific run detail
│   │   ├── about/page.tsx              # Methodology
│   │   └── layout.tsx                  # Shared nav, footer, theme
│   ├── components/
│   │   ├── BenchmarkTable.tsx        # Sortable, colour-coded main table
│   │   ├── RadarChart.tsx              # Category radar (Recharts)
│   │   ├── TierBadge.tsx              # Colour-coded T0-T3 badge
│   │   ├── FingerprintMatrix.tsx       # Interactive surface×technique grid
│   │   ├── ModelCompare.tsx            # Side-by-side model selector
│   │   ├── HistoryChart.tsx            # Score-over-time line chart
│   │   ├── ScenarioTable.tsx           # Filterable scenario results table
│   │   ├── CategoryBar.tsx             # Horizontal bar chart for categories
│   │   └── Navbar.tsx                  # Top nav matching thoughtjack.io
│   ├── lib/
│   │   ├── data.ts                     # Build-time data fetching from GitHub
│   │   ├── scoring.ts                  # Score computation helpers
│   │   └── types.ts                    # TypeScript interfaces (from schema above)
│   └── styles/
│       └── globals.css                 # Tailwind config matching ThoughtJack theme
├── public/
│   └── og/                             # Generated Open Graph images
├── next.config.js
├── tailwind.config.js
└── package.json
```

---

## Development with Claude Code

To build this site, Claude Code needs:

1. This spec file
2. Access to a sample `scored.json` (generate a mock one matching the schema above with realistic data from the R4 validation report)
3. The thoughtjack.io URL to reference for visual styling
4. The Recharts docs for chart components

Start with the data layer (`lib/data.ts`, `lib/types.ts`), then the landing page with the benchmark table and radar chart, then the fingerprint matrix, then the model detail page, then the run archive. The about page is last — it's static content.
