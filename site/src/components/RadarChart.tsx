'use client';

import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import type { ModelResult } from '@/lib/types';
import { CATEGORY_SHORT_NAMES } from '@/lib/constants';

const MODEL_COLORS = [
  '#4f46e5', '#ef4444', '#22c55e', '#f59e0b', '#3b82f6',
  '#a855f7', '#06b6d4', '#f97316', '#ec4899', '#84cc16',
];

interface Props {
  models: ModelResult[];
  maxModels?: number;
}

export function RadarChartComponent({ models, maxModels = 5 }: Props) {
  const displayed = models
    .sort((a, b) => b.aggregate - a.aggregate)
    .slice(0, maxModels);

  if (displayed.length === 0) return null;

  const categoryNames = displayed[0].categories.map((c) => c.name);
  const data = categoryNames.map((name) => {
    const entry: Record<string, string | number> = {
      category: CATEGORY_SHORT_NAMES[name] ?? name,
    };
    displayed.forEach((model) => {
      const cat = model.categories.find((c) => c.name === name);
      entry[model.id] = cat?.score ?? 0;
    });
    return entry;
  });

  return (
    <div className="w-full h-[400px]">
      <ResponsiveContainer>
        <RechartsRadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
          <PolarGrid stroke="#6366f130" />
          <PolarAngleAxis
            dataKey="category"
            tick={{ fill: '#9ca3af', fontSize: 12 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: '#6b7280', fontSize: 10 }}
          />
          {displayed.map((model, i) => (
            <Radar
              key={model.id}
              name={model.display_name}
              dataKey={model.id}
              stroke={MODEL_COLORS[i % MODEL_COLORS.length]}
              fill={MODEL_COLORS[i % MODEL_COLORS.length]}
              fillOpacity={0.08}
              strokeWidth={2}
            />
          ))}
          <Legend
            wrapperStyle={{ fontSize: 12, color: '#9ca3af' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e1b4b',
              border: '1px solid #312e81',
              borderRadius: 8,
              color: '#e0e7ff',
              fontSize: 12,
            }}
          />
        </RechartsRadarChart>
      </ResponsiveContainer>
    </div>
  );
}
