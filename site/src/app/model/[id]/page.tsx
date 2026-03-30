import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLatestRun, getAllModelIds, getModelHistory } from '@/lib/data';
import { TypeBadge } from '@/components/TypeBadge';
import { ScenarioTable } from '@/components/ScenarioTable';
import { CategoryBarWrapper } from '@/components/CategoryBarWrapper';
import { HistoryChartWrapper } from '@/components/HistoryChartWrapper';
import { scoreToBg } from '@/lib/scoring';
import { PROVIDER_NAMES } from '@/lib/constants';

export function generateStaticParams() {
  return getAllModelIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const run = getLatestRun();
  const model = run?.models.find((m) => m.id === id);
  return {
    title: model ? `${model.display_name} Security Score` : 'Model Detail',
  };
}

export default async function ModelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = getLatestRun();
  if (!run) return notFound();

  const model = run.models.find((m) => m.id === id);
  if (!model) return notFound();

  const history = getModelHistory(id);

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold">{model.display_name}</h1>
            <TypeBadge type={model.type} />
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {PROVIDER_NAMES[model.provider] ?? model.provider} &middot; Last tested {run.metadata.date}
          </p>
          {model.data_completeness && model.data_completeness.missing > 0 && (
            <p className="mt-1 text-xs text-amber-500 dark:text-amber-400">
              Partial data: {model.data_completeness.complete + model.data_completeness.partial}/{model.data_completeness.total} scenarios completed ({model.data_completeness.missing} failed due to API errors)
            </p>
          )}
        </div>
        <div className="flex gap-4">
          <div className="text-center">
            <div
              className="text-4xl font-bold tabular-nums rounded-lg px-4 py-2"
              style={{ backgroundColor: scoreToBg(model.aggregate) }}
            >
              {model.aggregate.toFixed(1)}
            </div>
            <div className="text-xs text-gray-500 mt-1">Resistance</div>
          </div>
          <div className="text-center">
            <div
              className="text-4xl font-bold tabular-nums rounded-lg px-4 py-2"
              style={{ backgroundColor: scoreToBg(model.utility_score) }}
            >
              {model.utility_score.toFixed(1)}
            </div>
            <div className="text-xs text-gray-500 mt-1">Utility</div>
          </div>
        </div>
      </div>

      {/* Category bar chart */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Category Breakdown</h2>
        <CategoryBarWrapper categories={model.categories} />
      </div>

      {/* History chart */}
      {history.length > 1 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Score History</h2>
          <HistoryChartWrapper history={history} />
        </div>
      )}

      {/* Scenario table */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Scenario Results</h2>
        <ScenarioTable scenarios={model.scenarios} runDate={run.metadata.date} modelId={model.id} />
      </div>

      {/* Utility scenarios */}
      {model.utility_scenarios.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Utility Tasks</h2>
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-zinc-900/50 text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider">Task</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider">Pass Rate</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider">Runs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/50">
                {model.utility_scenarios.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-zinc-900/30">
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs text-primary-600 dark:text-primary-400">{u.id}</span>
                      <span className="ml-2 text-gray-600 dark:text-gray-400 text-xs">{u.task}</span>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{(u.pass_rate * 100).toFixed(0)}%</td>
                    <td className="px-3 py-2 flex gap-1">
                      {u.runs.map((passed, i) => (
                        <span
                          key={i}
                          className={`w-5 h-5 rounded text-xs flex items-center justify-center ${
                            passed
                              ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                              : 'bg-red-500/15 text-red-600 dark:text-red-400'
                          }`}
                        >
                          {passed ? '\u2713' : '\u2717'}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
