'use client';

import { useState, useMemo } from 'react';
import type { ScenarioResult, SortDirection } from '@/lib/types';
import { OATF_BASE_URL } from '@/lib/constants';
import { TierBadge } from './TierBadge';
import { TraceViewer } from './TraceViewer';

interface Props {
  scenarios: ScenarioResult[];
  initialCategoryFilter?: string;
  runDate?: string;
  modelId?: string;
}

export function ScenarioTable({ scenarios, initialCategoryFilter, runDate, modelId }: Props) {
  const [sortField, setSortField] = useState('worst_case_tier');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const [categoryFilter, setCategoryFilter] = useState(initialCategoryFilter ?? '');
  const [tierFilter, setTierFilter] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const categories = useMemo(
    () => [...new Set(scenarios.map((s) => s.category))].sort(),
    [scenarios],
  );

  const filtered = useMemo(() => {
    let list = scenarios;
    if (categoryFilter) list = list.filter((s) => s.category === categoryFilter);
    if (tierFilter > 0) list = list.filter((s) => s.worst_case_tier >= tierFilter);
    return [...list].sort((a, b) => {
      const getValue = (s: ScenarioResult): number => {
        if (sortField === 'worst_case_tier') return s.worst_case_tier;
        if (sortField === 'typical_tier') return s.typical_tier;
        if (sortField === 'max_tier') return s.max_tier;
        return 0;
      };
      const av = getValue(a);
      const bv = getValue(b);
      return sortDir === 'desc' ? bv - av : av - bv;
    });
  }, [scenarios, categoryFilter, tierFilter, sortField, sortDir]);

  function handleSort(field: string) {
    if (field === sortField) setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    else { setSortField(field); setSortDir('desc'); }
  }

  function toggleExpand(id: string) {
    setExpandedId(expandedId === id ? null : id);
  }

  function SortTh({ field, label, className }: { field: string; label: string; className?: string }) {
    const active = sortField === field;
    return (
      <th
        className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wider cursor-pointer select-none hover:text-primary-600 dark:hover:text-primary-400 ${className ?? ''}`}
        onClick={() => handleSort(field)}
      >
        {label}{active && <span className="ml-1">{sortDir === 'desc' ? '\u2193' : '\u2191'}</span>}
      </th>
    );
  }

  const hasTraces = !!(runDate && modelId);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="text-sm rounded-md border border-gray-300 dark:border-primary-800 bg-white dark:bg-primary-950 px-2 py-1 text-gray-700 dark:text-gray-300"
        >
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(Number(e.target.value))}
          className="text-sm rounded-md border border-gray-300 dark:border-primary-800 bg-white dark:bg-primary-950 px-2 py-1 text-gray-700 dark:text-gray-300"
        >
          <option value={0}>All tiers</option>
          <option value={2}>T2+ only</option>
          <option value={3}>T3 only</option>
        </select>
        <span className="text-xs text-gray-400 self-center">{filtered.length} scenarios</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-primary-900/50">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-primary-950/50 text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider">Scenario</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider hidden md:table-cell">Category</th>
              <SortTh field="worst_case_tier" label="Worst" />
              <SortTh field="typical_tier" label="Typical" />
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider">Consistency</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider hidden lg:table-cell">Surface</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider hidden lg:table-cell">Technique</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider hidden md:table-cell">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-primary-900/30">
            {filtered.map((s) => {
              const isExpanded = expandedId === s.id;
              return (
                <>
                  <tr
                    key={s.id}
                    id={s.id}
                    className={`transition-colors ${
                      hasTraces ? 'cursor-pointer' : ''
                    } ${
                      isExpanded
                        ? 'bg-gray-50 dark:bg-primary-950/30'
                        : 'hover:bg-gray-50 dark:hover:bg-primary-950/30'
                    }`}
                    onClick={hasTraces ? () => toggleExpand(s.id) : undefined}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {hasTraces && (
                          <span className="text-xs text-gray-400 w-3 flex-shrink-0">
                            {isExpanded ? '\u25BC' : '\u25B6'}
                          </span>
                        )}
                        <div>
                          <a
                            href={`${OATF_BASE_URL}/${s.id}/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs text-primary-600 dark:text-primary-400 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {s.id}
                          </a>
                          <span className="ml-2 text-gray-600 dark:text-gray-400 text-xs">{s.name}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 hidden md:table-cell">{s.category}</td>
                    <td className="px-3 py-2"><TierBadge tier={s.worst_case_tier} /></td>
                    <td className="px-3 py-2"><TierBadge tier={s.typical_tier} /></td>
                    <td className="px-3 py-2 text-xs tabular-nums text-gray-500">{s.consistency}</td>
                    <td className="px-3 py-2 text-xs font-mono text-gray-400 hidden lg:table-cell">{s.surface}</td>
                    <td className="px-3 py-2 text-xs font-mono text-gray-400 hidden lg:table-cell">{s.technique}</td>
                    <td className="px-3 py-2 hidden md:table-cell">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${s.type === 'primary' ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                        {s.type}
                      </span>
                    </td>
                  </tr>
                  {isExpanded && hasTraces && (
                    <tr key={`${s.id}-trace`}>
                      <td colSpan={8} className="p-0 border-t-0">
                        <TraceViewer
                          scenarioId={s.id}
                          modelId={modelId!}
                          runDate={runDate!}
                          runs={s.runs}
                          maxTier={s.max_tier}
                        />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
