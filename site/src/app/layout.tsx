import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { getLatestRun } from '@/lib/data';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'ThoughtJack AI Agent Security Benchmark',
    template: '%s | ThoughtJack Benchmark',
  },
  description:
    'How resistant are frontier LLMs to adversarial attacks on MCP, A2A, and AG-UI protocols? We test 57 scenarios against 20 models.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const run = getLatestRun();
  const lastUpdated = run?.metadata.date;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-white dark:bg-[#09090b] text-gray-900 dark:text-zinc-100">
        <ThemeProvider>
          <Navbar />
          <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
          <Footer lastUpdated={lastUpdated} />
        </ThemeProvider>
      </body>
    </html>
  );
}
