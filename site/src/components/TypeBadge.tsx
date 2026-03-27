import { TYPE_COLORS } from '@/lib/constants';

export function TypeBadge({ type }: { type: string }) {
  const classes = TYPE_COLORS[type] ?? TYPE_COLORS.standard;
  const label = type.charAt(0).toUpperCase() + type.slice(1);

  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border ${classes}`}>
      {label}
    </span>
  );
}
