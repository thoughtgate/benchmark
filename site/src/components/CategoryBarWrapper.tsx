'use client';

import dynamic from 'next/dynamic';
import type { CategoryScore } from '@/lib/types';

const CategoryBar = dynamic(
  () => import('@/components/CategoryBar').then((m) => m.CategoryBar),
  { ssr: false, loading: () => <div className="w-full h-[280px] animate-pulse bg-gray-100 dark:bg-primary-950/30 rounded-lg" /> },
);

export function CategoryBarWrapper({ categories, onCategoryClick }: { categories: CategoryScore[]; onCategoryClick?: (name: string) => void }) {
  return <CategoryBar categories={categories} onCategoryClick={onCategoryClick} />;
}
