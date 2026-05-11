import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getRun, getAllRunDates, getRunMetadata } from '@/lib/data';
import { GITHUB_REPO } from '@/lib/constants';
import { BenchmarkTable } from '@/components/BenchmarkTable';

export function generateStaticParams() {
  return getAllRunDates().map((date) => ({ date }));
}

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }): Promise<Metadata> {
  const { date } = await params;
  return { title: `Benchmark Run ${date}` };
}

export default async function RunDetailPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const run = getRun(date);
  if (!run) return notFound();

  const meta = getRunMetadata(date);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Benchmark Run &mdash; {date}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {run.models.length} models &middot; ThoughtJack v{run.metadata.thoughtjack_version}
        </p>
      </div>

      {/* Metadata */}
      <div className="rounded-lg border border-gray-200 dark:border-zinc-800 p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider">Scenario Set</div>
          <div className="font-mono">{run.metadata.scenario_set_version}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider">Scenario Commit</div>
          <a
            href={`${GITHUB_REPO}/commit/${run.metadata.scenario_commit}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-primary-600 dark:text-primary-400 hover:underline"
          >
            {run.metadata.scenario_commit}
          </a>
        </div>
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider">Runs per Scenario</div>
          <div>{run.metadata.runs_per_scenario}</div>
        </div>
        {meta && typeof meta.duration_seconds === 'number' && (
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wider">Duration</div>
            <div>{Math.round(meta.duration_seconds / 60)}m</div>
          </div>
        )}
      </div>

      {/* Results table */}
      <BenchmarkTable models={run.models} />
    </div>
  );
}
