/**
 * app/page.tsx
 * Landing page — dark hero, headline, scan input, 3 stat cards.
 * Server Component; ScanInput is a client island.
 */

import type { Metadata } from 'next'
import Navbar from '@/components/layout/navbar'
import Footer from '@/components/layout/footer'
import ScanInput from '@/components/scan-input'

export const metadata: Metadata = {
  title: 'VibeCheck — Security Scanner for AI-Generated Code',
  description:
    'VibeCheck scans your GitHub repository for security vulnerabilities in seconds. Powered by IBM Granite, Watson NLU, and Featherless AI.',
}

const STATS = [
  {
    figure: '45%',
    label: 'of AI-generated code contains security vulnerabilities',
  },
  {
    figure: '60s',
    label: 'average scan time — no setup required',
  },
  {
    figure: 'IBM',
    label: 'Granite · Watson NLU · Cloud Object Storage',
  },
]

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
      <Navbar />

      <main id="main-content" className="flex flex-1 flex-col">
        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section
          className="flex flex-1 flex-col items-center justify-center px-4 py-24 sm:px-6 lg:px-8"
          aria-label="Hero"
        >
          <div className="flex max-w-3xl flex-col items-center gap-8 text-center">
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-mono"
              style={{
                borderColor: 'var(--color-border-subtle)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: 'var(--color-clean)' }}
                aria-hidden="true"
              />
              Powered by IBM Granite &amp; Featherless AI
            </div>

            {/* Headline */}
            <h1
              className="text-5xl font-bold leading-tight tracking-tight sm:text-6xl md:text-7xl"
              style={{
                color: 'var(--color-text-primary)',
                textWrap: 'balance',
              }}
            >
              Your vibe&#8209;coded app<br />
              has vulnerabilities.
            </h1>

            {/* Sub-headline */}
            <p
              className="max-w-lg text-lg font-semibold sm:text-xl"
              style={{ color: 'var(--color-text-secondary)', textWrap: 'balance' }}
            >
              We found them.
            </p>

            <p
              className="max-w-xl text-sm leading-relaxed"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Paste your GitHub repository URL below. VibeCheck runs a fast-pass
              classifier followed by a deep IBM Granite scan — in under 60 seconds.
            </p>

            {/* Scan Input */}
            <ScanInput />

            {/* Example hint */}
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Example:{' '}
              <code
                className="font-mono"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                https://github.com/owner/repo
              </code>
            </p>
          </div>
        </section>

        {/* ── Stat Cards ────────────────────────────────────────────── */}
        <section
          className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6 lg:px-8"
          aria-label="Key statistics"
        >
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3" role="list">
            {STATS.map(({ figure, label }) => (
              <li
                key={figure}
                className="rounded-lg border p-6"
                style={{
                  backgroundColor: 'var(--color-bg-secondary)',
                  borderColor: '#222222',
                }}
              >
                <p
                  className="mb-2 text-5xl font-bold tabular-nums"
                  style={{
                    color: 'var(--color-text-primary)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {figure}
                </p>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {label}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <Footer />
    </div>
  )
}
