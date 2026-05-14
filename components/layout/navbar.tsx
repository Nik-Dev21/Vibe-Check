'use client'

/**
 * components/layout/navbar.tsx
 * Fixed top navbar — VibeCheck wordmark + auth state.
 */

import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import ConnectGitHubButton from '@/components/auth/connect-github-button'

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

export default function Navbar() {
  const { data: session, status } = useSession()
  const isLoading = status === 'loading'

  return (
    <>
      {/* Skip to content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded focus:font-semibold focus-visible:ring-2 focus-visible:ring-white"
      >
        Skip to content
      </a>

      <header
        className="fixed top-0 left-0 right-0 z-40 border-b"
        style={{
          borderColor: 'var(--color-border-subtle)',
          backgroundColor: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
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
            <span style={{ color: 'var(--color-text-primary)' }}>
              <ShieldIcon />
            </span>
            <span
              translate="no"
              className="text-base font-bold tracking-tight"
              style={{ color: 'var(--color-text-primary)' }}
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

            {/* Auth state */}
            {!isLoading && (
              session ? (
                <div className="flex items-center gap-3">
                  {session.user.image && (
                    <img
                      src={session.user.image}
                      alt=""
                      width={28}
                      height={28}
                      className="rounded-full"
                    />
                  )}
                  <span
                    className="hidden sm:block text-xs font-mono"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {session.user.login ?? session.user.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => signOut()}
                    className="rounded border px-3 py-1 text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    style={{
                      borderColor: 'var(--color-border-subtle)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <ConnectGitHubButton />
              )
            )}
          </div>
        </nav>
      </header>

      {/* Spacer */}
      <div className="h-14" aria-hidden="true" />
    </>
  )
}
