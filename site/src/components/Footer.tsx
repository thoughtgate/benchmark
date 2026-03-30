import { GITHUB_REPO, THOUGHTJACK_URL, OATF_BASE_URL } from '@/lib/constants';

export function Footer({ lastUpdated }: { lastUpdated?: string }) {
  return (
    <footer className="border-t border-gray-200 dark:border-zinc-800 mt-16">
      <div className="max-w-7xl mx-auto px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-500 dark:text-zinc-500">
        <div className="flex items-center gap-4">
          <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer" className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
            GitHub
          </a>
          <a href={THOUGHTJACK_URL} target="_blank" rel="noopener noreferrer" className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
            ThoughtJack
          </a>
          <a href={OATF_BASE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
            OATF
          </a>
        </div>
        <div>
          {lastUpdated && <span>Last updated {lastUpdated} &middot; </span>}
          Built with ThoughtJack
        </div>
      </div>
    </footer>
  );
}
