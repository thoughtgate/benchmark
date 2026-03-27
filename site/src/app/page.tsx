import { getLatestRun, getRunFindings } from '@/lib/data';
import { BenchmarkTable } from '@/components/BenchmarkTable';
import { RadarChartWrapper } from '@/components/RadarChartWrapper';

export default function Home() {
  const run = getLatestRun();
  const findings = run ? getRunFindings(run.metadata.date) : null;

  if (!run) {
    return (
      <div className="text-center py-20">
        <h1 className="text-3xl font-bold">ThoughtJack AI Agent Security Benchmark</h1>
        <p className="mt-4 text-gray-500 dark:text-gray-400">No benchmark data available yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Hero */}
      <div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          AI Agent Security Benchmark
        </h1>
        <p className="mt-3 text-lg text-gray-600 dark:text-gray-400 max-w-3xl">
          How resistant are frontier LLMs to adversarial attacks on MCP, A2A, and AG-UI protocols?
          We test {run.models[0]?.scenarios.length ?? 57} scenarios against{' '}
          {run.models.length} models.
        </p>
        <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
          Last updated {run.metadata.date} &middot; ThoughtJack v{run.metadata.thoughtjack_version}
        </p>
      </div>

      {/* Benchmark table */}
      <BenchmarkTable models={run.models} />

      {/* Radar chart + findings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-lg font-semibold mb-4">Category Comparison</h2>
          <RadarChartWrapper models={run.models} />
        </div>

        {findings && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Key Findings</h2>
            <div className="rounded-lg border border-primary-500/20 bg-primary-500/5 p-6 space-y-4">
              {findings.split('\n\n').filter(Boolean).map((finding, i) => (
                <p key={i} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                  {finding}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
