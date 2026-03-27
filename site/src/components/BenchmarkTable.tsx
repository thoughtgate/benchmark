'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ModelResult, SortDirection } from '@/lib/types';
import { CATEGORY_SHORT_NAMES } from '@/lib/constants';
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
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-primary-900/50">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-primary-950/50 text-gray-500 dark:text-gray-400">
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
                className="hidden xl:table-cell"
              />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-primary-900/30">
          {sorted.map((model, i) => (
            <tr key={model.id} className="hover:bg-gray-50 dark:hover:bg-primary-950/30 transition-colors">
              <td className="px-3 py-2 text-gray-400 tabular-nums">{i + 1}</td>
              <td className="px-3 py-2 font-medium">
                <Link
                  href={`/model/${model.id}/`}
                  className="text-gray-900 dark:text-gray-100 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                >
                  {model.display_name}
                </Link>
              </td>
              <td className="px-3 py-2 text-gray-500 dark:text-gray-400 hidden lg:table-cell capitalize">
                {model.provider}
              </td>
              <td className="px-3 py-2 hidden md:table-cell">
                <TypeBadge type={model.type} />
              </td>
              <ScoreCell score={model.aggregate} />
              <ScoreCell score={model.utility_score} />
              {model.categories.map((cat) => (
                <ScoreCell key={cat.name} score={cat.score} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
