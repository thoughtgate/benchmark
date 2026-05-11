'use client';

import { useState, useEffect } from 'react';
import type { ProcessedTrace, TraceEvent, TraceGroup, KillChainStage } from '@/lib/types';
import { TIER_LABELS, TIER_BG_CLASSES, OATF_SCENARIO_BASE_URL } from '@/lib/constants';
import { TierBadge } from './TierBadge';

// ============================================================================
// Actor color palette
// ============================================================================

const ACTOR_PALETTE = [
  { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/20', label: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/20', label: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  { bg: 'bg-green-500/10', text: 'text-green-600 dark:text-green-400', border: 'border-green-500/20', label: 'bg-green-500/15 text-green-600 dark:text-green-400' },
  { bg: 'bg-purple-500/10', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-500/20', label: 'bg-purple-500/15 text-purple-600 dark:text-purple-400' },
  { bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400', border: 'border-red-500/20', label: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  { bg: 'bg-cyan-500/10', text: 'text-cyan-600 dark:text-cyan-400', border: 'border-cyan-500/20', label: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' },
];

function getActorColor(actorIndex: number) {
  return ACTOR_PALETTE[actorIndex % ACTOR_PALETTE.length];
}

// ============================================================================
// Kill Chain Bar
// ============================================================================

const KILL_CHAIN_LABELS: Record<KillChainStage, string> = {
  delivery: 'Delivery',
  injection: 'Injection',
  decision: 'Decision',
  action: 'Action',
  impact: 'Impact',
};

const KILL_CHAIN_ORDER: KillChainStage[] = ['delivery', 'injection', 'decision', 'action', 'impact'];

function KillChainBar({ stage }: { stage: KillChainStage }) {
  const reachedIndex = KILL_CHAIN_ORDER.indexOf(stage);

  return (
    <div className="flex items-center gap-1">
      {KILL_CHAIN_ORDER.map((s, i) => {
        const reached = i <= reachedIndex;
        const isLast = i === reachedIndex;
        return (
          <div key={s} className="flex items-center gap-1">
            <div
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                reached
                  ? isLast && reachedIndex >= 3
                    ? 'bg-red-500/20 text-red-600 dark:text-red-400'
                    : isLast && reachedIndex >= 2
                      ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                      : 'bg-green-500/20 text-green-600 dark:text-green-400'
                  : 'bg-gray-500/10 text-gray-400 dark:text-gray-600'
              }`}
            >
              {KILL_CHAIN_LABELS[s]}
            </div>
            {i < KILL_CHAIN_ORDER.length - 1 && (
              <span className={`text-xs ${reached && i < reachedIndex ? 'text-gray-400' : 'text-gray-600 dark:text-gray-700'}`}>
                &rarr;
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Trace Message
// ============================================================================

const CONTENT_TRUNCATE_LENGTH = 500;

function formatContent(content: unknown): string {
  if (content === null || content === undefined) return '';
  if (typeof content === 'string') return content;
  return JSON.stringify(content, null, 2);
}

function TraceMessage({
  event,
  actorIndex,
}: {
  event: TraceEvent;
  actorIndex: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = getActorColor(actorIndex);
  const contentStr = formatContent(event.content);
  const isTruncated = contentStr.length > CONTENT_TRUNCATE_LENGTH;
  const displayContent = expanded || !isTruncated
    ? contentStr
    : contentStr.slice(0, CONTENT_TRUNCATE_LENGTH) + '...';

  const directionLabel = event.direction === 'outgoing' ? '\u2192' : '\u2190';

  return (
    <div className={`flex gap-3 py-2 px-3 rounded-md ${color.bg} border-l-2 ${color.border}`}>
      <div className="flex-shrink-0 w-40">
        <span className={`inline-block text-xs font-mono px-1.5 py-0.5 rounded ${color.label}`}>
          {event.actor}
        </span>
        <div className="flex items-center gap-1 mt-1">
          <span className="text-xs text-gray-400">{directionLabel}</span>
          <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
            {event.method}
          </span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <pre className="text-xs font-mono whitespace-pre-wrap break-words text-gray-700 dark:text-gray-300 leading-relaxed">
          {displayContent}
        </pre>
        {isTruncated && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline mt-1"
          >
            {expanded ? 'Show less' : 'Show full'}
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Divergence Group
// ============================================================================

function DivergenceGroup({
  group,
  actorMap,
  defaultExpanded,
}: {
  group: TraceGroup;
  actorMap: Record<string, number>;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const runLabels = group.run_indices.map((i) => `Run ${i + 1}`).join(', ');
  const tierLabel = TIER_LABELS[group.worst_tier] ?? 'Unknown';

  return (
    <div className="border border-gray-200 dark:border-zinc-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-zinc-900/30 transition-colors"
      >
        <span className="text-xs text-gray-400">{expanded ? '\u25BC' : '\u25B6'}</span>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {runLabels}
        </span>
        <TierBadge tier={group.worst_tier} size="sm" />
        <span className="text-xs text-gray-400">{tierLabel}</span>
        <span className="text-xs text-gray-500 ml-auto">
          {group.events.length} message{group.events.length !== 1 ? 's' : ''}
        </span>
      </button>
      {expanded && (
        <div className="px-4 pb-3 space-y-1.5 border-t border-gray-100 dark:border-zinc-800/50 pt-3">
          {group.events.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No additional messages after shared prefix</p>
          ) : (
            group.events.map((event, i) => (
              <TraceMessage
                key={i}
                event={event}
                actorIndex={actorMap[event.actor] ?? 0}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// TraceViewer (main component)
// ============================================================================

interface Props {
  scenarioId: string;
  modelId: string;
  runDate: string;
  runs: number[];
  maxTier: number;
}

export function TraceViewer({ scenarioId, modelId, runDate, runs, maxTier }: Props) {
  const [trace, setTrace] = useState<ProcessedTrace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = `/traces/${runDate}/${modelId}/${scenarioId}.json`;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then((data: ProcessedTrace) => {
        setTrace(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Trace not available for this scenario');
        setLoading(false);
      });
  }, [scenarioId, modelId, runDate]);

  // Build actor -> color index map
  const actorMap: Record<string, number> = {};
  if (trace) {
    trace.actors.forEach((actor, i) => {
      actorMap[actor] = i;
    });
  }

  // Determine worst kill chain stage across all groups
  const worstStage: KillChainStage = trace
    ? trace.groups.reduce<KillChainStage>(
        (worst, g) => {
          const wi = KILL_CHAIN_ORDER.indexOf(worst);
          const gi = KILL_CHAIN_ORDER.indexOf(g.kill_chain_stage);
          return gi > wi ? g.kill_chain_stage : worst;
        },
        'delivery',
      )
    : 'delivery';

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        <div className="h-6 w-64 bg-gray-100 dark:bg-zinc-900/30 rounded animate-pulse" />
        <div className="h-20 bg-gray-100 dark:bg-zinc-900/30 rounded animate-pulse" />
        <div className="h-20 bg-gray-100 dark:bg-zinc-900/30 rounded animate-pulse" />
      </div>
    );
  }

  if (error || !trace) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-400 italic">{error ?? 'Trace not available'}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50/50 dark:bg-zinc-900/20">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <KillChainBar stage={worstStage} />
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>{trace.shared_prefix.length + (trace.groups[0]?.events.length ?? 0)} total messages</span>
            <span>&middot;</span>
            <span>{trace.actors.length} actors</span>
            <span>&middot;</span>
            <span>{trace.groups.length} distinct outcome{trace.groups.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <a
          href={`${OATF_SCENARIO_BASE_URL}/${scenarioId}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex-shrink-0"
        >
          View full OATF scenario &rarr;
        </a>
      </div>

      {/* Actor legend */}
      <div className="flex flex-wrap gap-2">
        {trace.actors.map((actor, i) => {
          const color = getActorColor(i);
          return (
            <span key={actor} className={`text-xs font-mono px-1.5 py-0.5 rounded ${color.label}`}>
              {actor}
            </span>
          );
        })}
      </div>

      {/* Shared prefix */}
      {trace.shared_prefix.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Shared across all runs
          </h4>
          {trace.shared_prefix.map((event, i) => (
            <TraceMessage
              key={i}
              event={event}
              actorIndex={actorMap[event.actor] ?? 0}
            />
          ))}
        </div>
      )}

      {/* Fork point */}
      {trace.groups.length > 0 && trace.shared_prefix.length > 0 && (
        <div className="flex items-center gap-3 py-1">
          <div className="flex-1 border-t border-dashed border-gray-300 dark:border-gray-700" />
          <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
            Runs diverge
          </span>
          <div className="flex-1 border-t border-dashed border-gray-300 dark:border-gray-700" />
        </div>
      )}

      {/* Divergence groups */}
      {trace.groups.length > 0 && (
        <div className="space-y-2">
          {trace.groups.map((group, i) => (
            <DivergenceGroup
              key={i}
              group={group}
              actorMap={actorMap}
              defaultExpanded={i === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
