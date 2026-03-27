export interface BenchmarkRun {
  metadata: RunMetadata;
  models: ModelResult[];
}

export interface RunMetadata {
  date: string;
  thoughtjack_version: string;
  scenario_set_version: string;
  scenario_commit: string;
  benchmark_commit: string;
  runs_per_scenario: number;
  workflow_run_id?: string;
}

export interface ModelResult {
  id: string;
  display_name: string;
  provider: string;
  type: 'standard' | 'reasoning' | 'hybrid';
  categories: CategoryScore[];
  aggregate: number;
  utility_score: number;
  scenarios: ScenarioResult[];
  utility_scenarios: UtilityResult[];
}

export interface CategoryScore {
  name: string;
  score: number;
  primary_count: number;
  variant_count: number;
}

export interface ScenarioResult {
  id: string;
  name: string;
  type: 'primary' | 'variant' | 'pending';
  category: string;
  surface: string;
  technique: string;
  max_tier: number;
  worst_case_tier: number;
  typical_tier: number;
  consistency: string;
  runs: number[];
}

export interface UtilityResult {
  id: string;
  name: string;
  task: string;
  pass_rate: number;
  runs: boolean[];
}

export interface RunManifest {
  latest: string;
  runs: RunEntry[];
}

export interface RunEntry {
  date: string;
  scenario_set_version: string;
  model_count: number;
  scenario_count: number;
  status: 'complete' | 'partial';
}

export type TierLevel = 0 | 1 | 2 | 3;
export type SortDirection = 'asc' | 'desc';
