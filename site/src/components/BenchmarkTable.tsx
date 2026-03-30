'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ModelResult, SortDirection } from '@/lib/types';
import { CATEGORY_SHORT_NAMES, PROVIDER_NAMES } from '@/lib/constants';
import { rankModels, scoreToBg } from '@/lib/scoring';
import { TypeBadge } from './TypeBadge';

interface Props {
  models: ModelResult[];
}

const FIXED_COLUMNS = [
  { key: 'rank', label: '#', sortable: false },
  { key: 'model', label: 'Model', sortable: false },
  { key: 'provider', label: 'Provider', sortable: false },
  { key: 'type', label: 'Type', sortable: false },
  { key: 'aggregate', label: 'Resistance', sortable: true },
  { key: 'utility_score', label: 'Utility', sortable: true },
];

export function BenchmarkTable({ models }: Props) {
  const [sortField, setSortField] = useState('aggregate');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  const categoryNames = models[0]?.categories.map((c) => c.name) ?? [];
  const sorted = rankModels(models, sortField, sortDir);

  function handleSort(field: string) {
    if (field === sortField) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  function SortHeader({ field, label, className }: { field: string; label: string; className?: string }) {
    const active = sortField === field;
    return (
      <th
        className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wider cursor-pointer select-none hover:text-primary-600 dark:hover:text-primary-400 transition-colors ${className ?? ''}`}
        onClick={() => handleSort(field)}
      >
        {label}
        {active && <span className="ml-1">{sortDir === 'desc' ? '\u2193' : '\u2191'}</span>}
      </th>
    );
  }

  function ScoreCell({ score }: { score: number }) {
    return (
      <td className="px-3 py-2 score-cell text-center" style={{ backgroundColor: scoreToBg(score) }}>
        {score.toFixed(1)}
      </td>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-zinc-900/50 text-gray-500 dark:text-gray-400">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider w-8">#</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider">Model</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider hidden lg:table-cell">Provider</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider hidden md:table-cell">Type</th>
            <SortHeader field="aggregate" label="Resistance" />
            <SortHeader field="utility_score" label="Utility" />
            {categoryNames.map((name) => (
              <SortHeader
                key={name}
                field={name}
                label={CATEGORY_SHORT_NAMES[name] ?? name.slice(0, 4)}
                className="hidden lg:table-cell"
              />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/50">
          {sorted.map((model, i) => {
            const dc = model.data_completeness;
            const completePct = dc ? Math.round(((dc.complete + dc.partial) / dc.total) * 100) : 100;
            const isIncomplete = completePct < 90;
            return (
            <tr key={model.id} className="hover:bg-gray-50 dark:hover:bg-zinc-900/30 transition-colors">
              <td className="px-3 py-2 text-gray-400 tabular-nums">{i + 1}</td>
              <td className="px-3 py-2 font-medium">
                <Link
                  href={`/model/${model.id}/`}
                  className="text-gray-900 dark:text-gray-100 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                >
                  {model.display_name}
                </Link>
                {isIncomplete && (
                  <span
                    className="ml-1.5 text-xs text-amber-500 dark:text-amber-400"
                    title={`${dc!.complete + dc!.partial}/${dc!.total} scenarios completed (${dc!.missing} missing)`}
                  >
                    {completePct}%
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                {PROVIDER_NAMES[model.provider] ?? model.provider}
              </td>
              <td className="px-3 py-2 hidden md:table-cell">
                <TypeBadge type={model.type} />
              </td>
              <ScoreCell score={model.aggregate} />
              <ScoreCell score={model.utility_score} />
              {model.categories.map((cat) => (
                <td key={cat.name} className="px-3 py-2 score-cell text-center hidden lg:table-cell" style={{ backgroundColor: scoreToBg(cat.score) }}>
                  {cat.score.toFixed(1)}
                </td>
              ))}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
