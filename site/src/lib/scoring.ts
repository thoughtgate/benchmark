import { TIER_COLORS } from './constants';
import type { ModelResult, SortDirection } from './types';

/** Interpolate from red (0) → yellow (50) → green (100) for score cells. */
export function scoreToColor(score: number): string {
  const s = Math.max(0, Math.min(100, score));
  if (s >= 50) {
    const t = (s - 50) / 50;
    const r = Math.round(245 * (1 - t) + 34 * t);
    const g = Math.round(158 * (1 - t) + 197 * t);
    const b = Math.round(11 * (1 - t) + 94 * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
  const t = s / 50;
  const r = Math.round(239 * (1 - t) + 245 * t);
  const g = Math.round(68 * (1 - t) + 158 * t);
  const b = Math.round(68 * (1 - t) + 11 * t);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Return a CSS background with transparency for score cells. */
export function scoreToBg(score: number): string {
  const color = scoreToColor(score);
  return color.replace('rgb(', 'rgba(').replace(')', ', 0.1)');
}

export function tierToColor(tier: number): string {
  return TIER_COLORS[tier] ?? '#6b7280';
}

export function rankModels(
  models: ModelResult[],
  sortField: string,
  sortDir: SortDirection,
): ModelResult[] {
  return [...models].sort((a, b) => {
    let av: number, bv: number;
    if (sortField === 'aggregate') {
      av = a.aggregate;
      bv = b.aggregate;
    } else if (sortField === 'utility_score') {
      av = a.utility_score;
      bv = b.utility_score;
    } else {
      const ac = a.categories.find((c) => c.name === sortField);
      const bc = b.categories.find((c) => c.name === sortField);
      av = ac?.score ?? 0;
      bv = bc?.score ?? 0;
    }
    return sortDir === 'desc' ? bv - av : av - bv;
  });
}
