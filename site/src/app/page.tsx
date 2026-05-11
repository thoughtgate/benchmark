import { getLatestRun } from '@/lib/data';
import { BenchmarkTable } from '@/components/BenchmarkTable';
import { OATF_BASE_URL, THOUGHTJACK_URL } from '@/lib/constants';

export default function Home() {
  const run = getLatestRun();

  if (!run) {
    return (
      <div className="text-center py-20">
        <h1 className="text-3xl font-bold">ThoughtJack AI Agent Security Benchmark</h1>
        <p className="mt-4 text-gray-500 dark:text-zinc-400">No benchmark data available yet.</p>
      </div>
    );
  }

  const scenarioCount = run.models[0]?.scenarios.length ?? 57;
  const categoryCount = run.models[0]?.categories.length ?? 7;

  return (
    <div className="space-y-12">
      {/* Hero */}
      <div className="pt-4 pb-2">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900 dark:text-zinc-100">
          Adversarial resistance benchmark for AI agents
        </h1>
        <p className="mt-3 text-lg text-gray-600 dark:text-zinc-400 max-w-3xl leading-relaxed">
          Measuring how frontier LLMs resist adversarial attacks
          across MCP, A2A, and AG-UI agentic protocols.
        </p>

        {/* Stat boxes */}
        <div className="mt-6 flex flex-wrap gap-6">
          {[
            { value: run.models.length, label: 'Models' },
            { value: scenarioCount, label: 'Scenarios' },
            { value: run.metadata.runs_per_scenario, label: 'Runs Each' },
            { value: categoryCount, label: 'Categories' },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="text-2xl font-bold font-mono text-gray-900 dark:text-zinc-100">
                {stat.value}
              </div>
              <div className="text-xs text-gray-500 dark:text-zinc-500 uppercase tracking-wider">
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-sm text-gray-400 dark:text-zinc-600">
          Based on the{' '}
          <a href={OATF_BASE_URL} target="_blank" rel="noopener noreferrer" className="text-primary-600 dark:text-primary-400 hover:underline">
            OATF specification
          </a>
          . Built with{' '}
          <a href={THOUGHTJACK_URL} target="_blank" rel="noopener noreferrer" className="text-primary-600 dark:text-primary-400 hover:underline">
            ThoughtJack
          </a>
          . Last updated {run.metadata.date}.
        </p>
      </div>

      {/* Benchmark table */}
      <BenchmarkTable models={run.models} />

    </div>
  );
}
