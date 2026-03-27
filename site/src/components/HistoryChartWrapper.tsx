'use client';

import dynamic from 'next/dynamic';
import type { CategoryScore } from '@/lib/types';

const HistoryChart = dynamic(
  () => import('@/components/HistoryChart').then((m) => m.HistoryChart),
  { ssr: false },
);

export function HistoryChartWrapper({
  history,
}: {
  history: { date: string; aggregate: number; categories: CategoryScore[] }[];
}) {
  if (history.length < 2) return null;
  return <HistoryChart history={history} />;
}
