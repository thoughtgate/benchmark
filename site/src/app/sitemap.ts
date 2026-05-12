import type { MetadataRoute } from 'next';
import { getAllModelIds, getAllRunDates, getLatestRun } from '@/lib/data';
import { SITE_URL } from '@/lib/constants';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const latestRun = getLatestRun();
  const lastModified = latestRun ? new Date(`${latestRun.metadata.date}T00:00:00Z`) : new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${SITE_URL}/about/`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/fingerprint/`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ];

  const modelRoutes: MetadataRoute.Sitemap = getAllModelIds().map((id) => ({
    url: `${SITE_URL}/model/${id}/`,
    lastModified,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  const runRoutes: MetadataRoute.Sitemap = getAllRunDates().map((date) => ({
    url: `${SITE_URL}/runs/${date}/`,
    lastModified: new Date(`${date}T00:00:00Z`),
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  return [...staticRoutes, ...modelRoutes, ...runRoutes];
}
