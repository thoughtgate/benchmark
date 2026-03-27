'use client';

import { useState, useMemo } from 'react';
import type { ModelResult } from '@/lib/types';
import type { MatrixData } from '@/lib/fingerprint';
import { SURFACE_LABELS, TECHNIQUE_LABELS, TIER_COLORS } from '@/lib/constants';
import { TierBadge } from './TierBadge';

interface Props {
  matrixData: MatrixData;
  models: ModelResult[];
}

export function FingerprintMatrix({ matrixData, models }: Props) {
  const sortedModels = useMemo(
    () => [...models].sort((a, b) => b.aggregate - a.aggregate),
    [models],
  );
  const [selectedModels, setSelectedModels] = useState<string[]>(
    sortedModels.slice(0, Math.min(3, sortedModels.length)).map((m) => m.id),
  );
  const [tierThreshold, setTierThreshold] = useState(0);
  const [expandedSurface, setExpandedSurface] = useState<string | null>(null);

  function toggleModel(id: string) {
    setSelectedModels((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  }

  const { surfaces, techniques, cells } = matrixData;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex flex-wrap gap-1.5">
          {sortedModels.map((m) => (
            <button
              key={m.id}
              onClick={() => toggleModel(m.id)}
              className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                selectedModels.includes(m.id)
                  ? 'bg-primary-500/15 text-primary-600 dark:text-primary-400 border-primary-500/30'
                  : 'text-gray-400 border-gray-300 dark:border-gray-700 hover:border-primary-500/30'
              }`}
            >
              {m.display_name}
            </button>
          ))}
        </div>
        <select
          value={tierThreshold}
          onChange={(e) => setTierThreshold(Number(e.target.value))}
          className="text-xs rounded-md border border-gray-300 dark:border-primary-800 bg-white dark:bg-primary-950 px-2 py-1 text-gray-700 dark:text-gray-300"
        >
          <option value={0}>All tiers</option>
          <option value={2}>T2+ only</option>
          <option value={3}>T3 only</option>
        </select>
      </div>

      {/* Matrix */}
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="px-2 py-2 text-left text-gray-400 font-medium sticky left-0 bg-white dark:bg-[#0f0d1a] z-10">
                Surface
              </th>
              {techniques.map((t) => (
                <th key={t} className="px-2 py-2 text-center text-gray-400 font-medium whitespace-nowrap" title={TECHNIQUE_LABELS[t]}>
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {surfaces.map((surface) => (
              <>
                <tr key={surface}>
                  <td
                    className="px-2 py-2 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 sticky left-0 bg-white dark:bg-[#0f0d1a] z-10"
                    onClick={() => setExpandedSurface(expandedSurface === surface ? null : surface)}
                    title={SURFACE_LABELS[surface]}
                  >
                    {expandedSurface === surface ? '\u25BC' : '\u25B6'} {surface}
                    <span className="ml-1 text-gray-400 font-normal">
                      {SURFACE_LABELS[surface] ?? ''}
                    </span>
                  </td>
                  {techniques.map((technique) => {
                    const cell = cells[surface]?.[technique];
                    if (!cell) {
                      return <td key={technique} className="px-2 py-2 text-center text-gray-300 dark:text-gray-700">&mdash;</td>;
                    }

                    return (
                      <td key={technique} className="px-1 py-1">
                        <div className="flex flex-wrap gap-0.5 justify-center min-w-[40px]">
                          {selectedModels.map((modelId) => {
                            const modelData = cell.byModel[modelId];
                            if (!modelData) return <DotEmpty key={modelId} />;
                            const tier = modelData.worstTier;
                            if (tierThreshold > 0 && tier < tierThreshold) {
                              return <DotMuted key={modelId} />;
                            }
                            return (
                              <div
                                key={modelId}
                                className="w-4 h-4 rounded-sm flex items-center justify-center text-[9px] font-bold"
                                style={{ backgroundColor: `${TIER_COLORS[tier]}25`, color: TIER_COLORS[tier] }}
                                title={`${models.find((m) => m.id === modelId)?.display_name}: T${tier} (${modelData.scenarioCount} scenario${modelData.scenarioCount > 1 ? 's' : ''})`}
                              >
                                {tier}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
                {/* Expanded row showing individual scenarios */}
                {expandedSurface === surface && (
                  <tr key={`${surface}-expanded`}>
                    <td colSpan={techniques.length + 1} className="px-4 py-3 bg-gray-50 dark:bg-primary-950/30">
                      <div className="space-y-2">
                        {Object.entries(cells[surface] ?? {}).flatMap(([tech, cell]) =>
                          cell.scenarios.map((scenario) => (
                            <div key={scenario.id} className="flex items-center gap-3 text-xs">
                              <span className="font-mono text-primary-600 dark:text-primary-400 w-24">{scenario.id}</span>
                              <span className="text-gray-400 w-8">{tech}</span>
                              <span className="text-gray-500 dark:text-gray-400 flex-1 truncate">{scenario.name}</span>
                              <div className="flex gap-1">
                                {selectedModels.map((modelId) => {
                                  const detail = cell.byModel[modelId]?.details.find((d) => d.id === scenario.id);
                                  if (!detail) return <span key={modelId} className="text-gray-300">&mdash;</span>;
                                  return <TierBadge key={modelId} tier={detail.worstTier} size="sm" />;
                                })}
                              </div>
                            </div>
                          )),
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DotEmpty() {
  return <div className="w-4 h-4 rounded-sm bg-gray-100 dark:bg-gray-800" />;
}

function DotMuted() {
  return <div className="w-4 h-4 rounded-sm bg-gray-100 dark:bg-gray-800 opacity-30" />;
}
