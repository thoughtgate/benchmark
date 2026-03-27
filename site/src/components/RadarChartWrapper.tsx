'use client';

import dynamic from 'next/dynamic';
import type { ModelResult } from '@/lib/types';

const RadarChartComponent = dynamic(
  () => import('@/components/RadarChart').then((m) => m.RadarChartComponent),
  { ssr: false, loading: () => <div className="w-full h-[400px] animate-pulse bg-gray-100 dark:bg-primary-950/30 rounded-lg" /> },
);

export function RadarChartWrapper({ models }: { models: ModelResult[] }) {
  return <RadarChartComponent models={models} />;
}
