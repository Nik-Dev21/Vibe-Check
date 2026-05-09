/**
 * components/layout/navbar.tsx
 * Fixed top navbar — VibeCheck wordmark + GitHub link.
 * Server Component (no interactivity needed).
 */

import Link from 'next/link'

function ShieldIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M10 2L3 5v5c0 4.418 3.134 8.56 7 9 3.866-.44 7-4.582 7-9V5L10 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M7 10l2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  )
}

export default function Navbar() {
  return (
    <>
      {/* Skip to content — accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded focus:font-semibold focus-visible:ring-2 focus-visible:ring-white"
      >
        Skip to content
      </a>

      <header
        className="fixed top-0 left-0 right-0 z-40 border-b"
        style={{ borderColor: 'var(--color-border-subtle)', backgroundColor: 'var(--color-bg-primary)' }}
      >
        <nav
          className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
          aria-label="Main navigation"
        >
          {/* Wordmark */}
          <Link
            href="/"
            className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded"
            aria-label="VibeCheck — home"
          >
            <span
              className="text-white"
              style={{ color: 'var(--color-text-primary)' }}
            >
              <ShieldIcon />
            </span>
            <span
              translate="no"
              className="text-base font-bold tracking-tight"
              style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}
            >
              VibeCheck
            </span>
          </Link>

          {/* Right side */}
          <div className="flex items-center gap-4">
            <span
              className="hidden sm:block text-xs font-mono px-2 py-0.5 rounded border"
              style={{
                color: 'var(--color-text-tertiary)',
                borderColor: 'var(--color-border-subtle)',
              }}
            >
              beta
            </span>
            <a
              href="https://github.com/Nik-Dev21/Vibe-Check"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View VibeCheck on GitHub"
              className="flex items-center gap-1.5 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded px-1"
              style={{ color: 'var(--color-text-secondary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
            >
              <GitHubIcon />
              <span className="hidden sm:inline">GitHub</span>
            </a>
          </div>
        </nav>
      </header>

      {/* Spacer to push content below fixed navbar */}
      <div className="h-14" aria-hidden="true" />
    </>
  )
}
