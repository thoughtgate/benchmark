import { TIER_BG_CLASSES, TIER_LABELS } from '@/lib/constants';

export function TierBadge({ tier, size = 'md' }: { tier: number; size?: 'sm' | 'md' }) {
  const classes = TIER_BG_CLASSES[tier] ?? 'bg-gray-500/15 text-gray-500 border-gray-500/30';
  const sizeClasses = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-xs px-2 py-0.5';

  return (
    <span
      className={`inline-block font-semibold rounded-full border ${classes} ${sizeClasses}`}
      aria-label={`Tier ${tier}: ${TIER_LABELS[tier] ?? 'Unknown'}`}
    >
      T{tier}
    </span>
  );
}
