'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ThemeToggle } from './ThemeToggle';

const NAV_LINKS = [
  { href: '/', label: 'Results' },
  { href: '/fingerprint/', label: 'Fingerprint' },
  { href: '/runs/', label: 'Runs' },
  { href: '/about/', label: 'About' },
];

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="border-b border-gray-200 dark:border-zinc-800 bg-white/80 dark:bg-[#09090b]/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="font-semibold text-gray-900 dark:text-zinc-100 flex items-center gap-2">
            <svg className="w-5 h-5 text-primary-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
            ThoughtJack Benchmark
          </Link>
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    active
                      ? 'text-primary-500 dark:text-primary-400'
                      : 'text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800/50'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://thoughtjack.io"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:block text-sm text-gray-500 dark:text-zinc-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            thoughtjack.io &rarr;
          </a>
          <ThemeToggle />
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-800"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-200 dark:border-zinc-800 px-4 py-2 space-y-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2 rounded-md text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800/50"
            >
              {link.label}
            </Link>
          ))}
          <a
            href="https://thoughtjack.io"
            target="_blank"
            rel="noopener noreferrer"
            className="block px-3 py-2 rounded-md text-sm text-gray-500 dark:text-zinc-500"
          >
            thoughtjack.io &rarr;
          </a>
        </div>
      )}
    </nav>
  );
}
