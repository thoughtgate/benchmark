import type { Metadata } from 'next';
import Link from 'next/link';
import { getRunManifest } from '@/lib/data';
import { GITHUB_REPO } from '@/lib/constants';

export const metadata: Metadata = { title: 'Run Archive' };

export default function RunsPage() {
  const manifest = getRunManifest();

  if (!manifest || manifest.runs.length === 0) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold">Run Archive</h1>
        <p className="mt-4 text-gray-500">No benchmark runs available yet.</p>
      </div>
    );
  }

  const runs = [...manifest.runs].reverse();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Run Archive</h1>
      <p className="text-gray-500 dark:text-gray-400 text-sm">
        All benchmark runs, newest first. Download raw data for any run.
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-zinc-900/50 text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider">Date</th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider">Scenario Set</th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider">Models</th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider">Scenarios</th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider">Status</th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider">Data</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/50">
            {runs.map((run) => (
              <tr key={run.date} className="hover:bg-gray-50 dark:hover:bg-zinc-900/30 transition-colors">
                <td className="px-4 py-3">
                  <Link
                    href={`/runs/${run.date}/`}
                    className="font-medium text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    {run.date}
                  </Link>
                  {run.date === manifest.latest && (
                    <span className="ml-2 text-xs bg-primary-500/15 text-primary-600 dark:text-primary-400 px-1.5 py-0.5 rounded">
                      latest
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{run.scenario_set_version}</td>
                <td className="px-4 py-3 tabular-nums">{run.model_count}</td>
                <td className="px-4 py-3 tabular-nums">{run.scenario_count}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    run.status === 'complete'
                      ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                      : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  }`}>
                    {run.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs space-x-3">
                  <a
                    href={`${GITHUB_REPO}/blob/main/runs/${run.date}/scored.json`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    scored.json
                  </a>
                  <a
                    href={`${GITHUB_REPO}/blob/main/runs/${run.date}/report.md`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    report.md
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
