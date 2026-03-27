import fs from 'fs';
import path from 'path';
import type { BenchmarkRun, RunManifest, CategoryScore } from './types';

const RUNS_DIR = path.resolve(process.cwd(), '..', 'runs');

function readJsonSafe<T>(filePath: string): T | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

function readTextSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export function getRunManifest(): RunManifest | null {
  return readJsonSafe<RunManifest>(path.join(RUNS_DIR, 'manifest.json'));
}

export function getLatestRun(): BenchmarkRun | null {
  const manifest = getRunManifest();
  if (!manifest?.latest) return null;
  return getRun(manifest.latest);
}

export function getRun(date: string): BenchmarkRun | null {
  return readJsonSafe<BenchmarkRun>(path.join(RUNS_DIR, date, 'scored.json'));
}

export function getRunMetadata(date: string): Record<string, unknown> | null {
  return readJsonSafe<Record<string, unknown>>(path.join(RUNS_DIR, date, 'metadata.json'));
}

export function getRunFindings(date: string): string | null {
  return readTextSafe(path.join(RUNS_DIR, date, 'findings.md'));
}

export function getAllRuns(): { date: string; run: BenchmarkRun }[] {
  const manifest = getRunManifest();
  if (!manifest) return [];
  const results: { date: string; run: BenchmarkRun }[] = [];
  for (const entry of manifest.runs) {
    const run = getRun(entry.date);
    if (run) results.push({ date: entry.date, run });
  }
  return results;
}

export function getAllModelIds(): string[] {
  const run = getLatestRun();
  if (!run) return [];
  return run.models.map((m) => m.id);
}

export function getAllRunDates(): string[] {
  const manifest = getRunManifest();
  if (!manifest) return [];
  return manifest.runs.map((r) => r.date);
}

export function getModelHistory(
  modelId: string,
): { date: string; aggregate: number; categories: CategoryScore[] }[] {
  const allRuns = getAllRuns();
  const history: { date: string; aggregate: number; categories: CategoryScore[] }[] = [];
  for (const { date, run } of allRuns) {
    const model = run.models.find((m) => m.id === modelId);
    if (model) {
      history.push({ date, aggregate: model.aggregate, categories: model.categories });
    }
  }
  return history;
}
