'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import type { CategoryScore } from '@/lib/types';

const CATEGORY_COLORS = [
  '#4f46e5', '#ef4444', '#22c55e', '#f59e0b', '#3b82f6', '#a855f7', '#06b6d4',
];

interface Props {
  history: { date: string; aggregate: number; categories: CategoryScore[] }[];
}

export function HistoryChart({ history }: Props) {
  if (history.length < 2) return null;

  const categoryNames = history[0].categories.map((c) => c.name);
  const data = history.map((entry) => {
    const point: Record<string, string | number> = {
      date: entry.date,
      Aggregate: entry.aggregate,
    };
    entry.categories.forEach((c) => {
      point[c.name] = c.score;
    });
    return point;
  });

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
          <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} />
          <YAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e1b4b',
              border: '1px solid #312e81',
              borderRadius: 8,
              color: '#e0e7ff',
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line
            dataKey="Aggregate"
            stroke="#ffffff"
            strokeWidth={3}
            dot={{ r: 4 }}
          />
          {categoryNames.map((name, i) => (
            <Line
              key={name}
              dataKey={name}
              stroke={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
              strokeWidth={1.5}
              strokeDasharray="4 2"
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
