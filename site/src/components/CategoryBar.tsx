'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
  Tooltip,
} from 'recharts';
import type { CategoryScore } from '@/lib/types';
import { scoreToColor } from '@/lib/scoring';

interface Props {
  categories: CategoryScore[];
  onCategoryClick?: (name: string) => void;
}

export function CategoryBar({ categories, onCategoryClick }: Props) {
  const data = categories.map((c) => ({
    name: c.name,
    score: c.score,
    primaries: c.primary_count,
    variants: c.variant_count,
  }));

  return (
    <div className="w-full h-[280px]">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 120, right: 40, top: 5, bottom: 5 }}>
          <XAxis type="number" domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            onClick={(e) => onCategoryClick?.(e.value as string)}
            style={{ cursor: onCategoryClick ? 'pointer' : 'default' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e1b4b',
              border: '1px solid #312e81',
              borderRadius: 8,
              color: '#e0e7ff',
              fontSize: 12,
            }}
            formatter={(value: number) => [`${value.toFixed(1)}`, 'Score']}
          />
          <Bar dataKey="score" radius={[0, 4, 4, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={scoreToColor(entry.score)}
                fillOpacity={0.7}
                cursor={onCategoryClick ? 'pointer' : 'default'}
                onClick={() => onCategoryClick?.(entry.name)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
