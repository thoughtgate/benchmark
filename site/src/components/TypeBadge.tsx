export function TypeBadge({ type }: { type: string }) {
  const label = type.charAt(0).toUpperCase() + type.slice(1);

  return (
    <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full border border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-400">
      {label}
    </span>
  );
}
