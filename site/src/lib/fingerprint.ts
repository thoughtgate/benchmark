import type { ModelResult } from './types';

export interface CellData {
  scenarios: { id: string; name: string }[];
  byModel: Record<string, {
    worstTier: number;
    scenarioCount: number;
    details: { id: string; worstTier: number; typicalTier: number }[];
  }>;
}

export interface MatrixData {
  surfaces: string[];
  techniques: string[];
  cells: Record<string, Record<string, CellData>>;
}

export function buildFingerprintMatrix(models: ModelResult[]): MatrixData {
  const surfaceSet = new Set<string>();
  const techniqueSet = new Set<string>();
  const cells: Record<string, Record<string, CellData>> = {};

  for (const model of models) {
    for (const scenario of model.scenarios) {
      if (!scenario.surface || !scenario.technique) continue;

      surfaceSet.add(scenario.surface);
      techniqueSet.add(scenario.technique);

      if (!cells[scenario.surface]) cells[scenario.surface] = {};
      if (!cells[scenario.surface][scenario.technique]) {
        cells[scenario.surface][scenario.technique] = {
          scenarios: [],
          byModel: {},
        };
      }

      const cell = cells[scenario.surface][scenario.technique];

      // Add scenario if not already present
      if (!cell.scenarios.find((s) => s.id === scenario.id)) {
        cell.scenarios.push({ id: scenario.id, name: scenario.name });
      }

      // Add model data
      if (!cell.byModel[model.id]) {
        cell.byModel[model.id] = { worstTier: 0, scenarioCount: 0, details: [] };
      }
      const modelCell = cell.byModel[model.id];
      modelCell.details.push({
        id: scenario.id,
        worstTier: scenario.worst_case_tier,
        typicalTier: scenario.typical_tier,
      });
      modelCell.worstTier = Math.max(modelCell.worstTier, scenario.worst_case_tier);
      modelCell.scenarioCount = modelCell.details.length;
    }
  }

  const sortKey = (s: string) => {
    const num = parseInt(s.replace(/\D/g, ''), 10);
    return isNaN(num) ? 999 : num;
  };

  return {
    surfaces: [...surfaceSet].sort((a, b) => sortKey(a) - sortKey(b)),
    techniques: [...techniqueSet].sort((a, b) => sortKey(a) - sortKey(b)),
    cells,
  };
}
