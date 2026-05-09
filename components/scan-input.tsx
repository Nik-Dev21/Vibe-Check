'use client'

/**
 * components/scan-input.tsx
 * GitHub URL input with client-side validation + Scan Now button.
 * Shows RepoSelector for authenticated users, raw URL input for guests.
 */

import { useState, useId } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import RepoSelector from '@/components/repo-selector'
import ConnectGitHubButton from '@/components/auth/connect-github-button'

const GITHUB_REPO_RE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\/.*)?$/

function SpinnerIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="animate-spin"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="60"
        strokeDashoffset="20"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function ScanInput() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const inputId = useId()
  const errorId = useId()

  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)

  const isAuthenticated = status === 'authenticated' && !!session

  function validate(url: string): string | null {
    if (!url.trim()) return 'Enter a GitHub repository URL to scan.'
    if (!GITHUB_REPO_RE.test(url.trim())) {
      return 'URL must be a valid GitHub repository (e.g. https://github.com/owner/repo).'
    }
    return null
  }

  async function handleScan(repoUrl: string) {
    const validationError = validate(repoUrl)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setIsScanning(true)

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: repoUrl.trim() }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? `Server error ${res.status}`)
      }

      const data = (await res.json()) as { scanId: string }
      router.push(`/scan/${data.scanId}`)
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} — check the URL and try again.`
          : 'Scan failed — check the URL and try again.'
      )
      setIsScanning(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await handleScan(value)
  }

  function handleRepoSelect(repoUrl: string) {
    setValue(repoUrl)
  }

  return (
    <div className="w-full max-w-2xl flex flex-col gap-4">
      {/* Authenticated: repo selector + scan button */}
      {isAuthenticated && (
        <div className="flex flex-col gap-3">
          <RepoSelector onSelect={handleRepoSelect} />
          <div className="flex gap-2">
            <input
              id={inputId}
              type="url"
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                if (error) setError(null)
              }}
              placeholder="Or paste a GitHub URL…"
              autoComplete="off"
              spellCheck={false}
              disabled={isScanning}
              aria-invalid={error ? 'true' : 'false'}
              aria-describedby={error ? errorId : undefined}
              className="flex-1 rounded-lg px-4 py-3 text-sm font-mono transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                border: `1px solid ${error ? 'var(--color-critical)' : 'var(--color-border-subtle)'}`,
                color: 'var(--color-text-primary)',
              }}
            />
            <button
              type="button"
              disabled={isScanning || !value.trim()}
              onClick={() => handleScan(value)}
              className="flex shrink-0 items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--color-text-primary)',
                color: 'var(--color-bg-primary)',
              }}
            >
              {isScanning ? (
                <>
                  <SpinnerIcon />
                  <span>Scanning…</span>
                </>
              ) : (
                'Scan Now'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Unauthenticated: URL input + connect button */}
      {!isAuthenticated && status !== 'loading' && (
        <div className="flex flex-col gap-4 items-center">
          <ConnectGitHubButton />
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Or scan a public repo without signing in:
          </p>
          <form
            onSubmit={handleSubmit}
            className="w-full"
            noValidate
            aria-label="Scan a GitHub repository"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:gap-2">
              <label htmlFor={inputId} className="sr-only">
                GitHub repository URL
              </label>
              <input
                id={inputId}
                type="url"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value)
                  if (error) setError(null)
                }}
                placeholder="https://github.com/owner/repo…"
                autoComplete="off"
                spellCheck={false}
                inputMode="url"
                disabled={isScanning}
                aria-invalid={error ? 'true' : 'false'}
                aria-describedby={error ? errorId : undefined}
                className="flex-1 rounded-lg px-4 py-3 text-sm font-mono transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--color-bg-secondary)',
                  border: `1px solid ${error ? 'var(--color-critical)' : 'var(--color-border-subtle)'}`,
                  color: 'var(--color-text-primary)',
                }}
              />
              <button
                type="submit"
                disabled={isScanning}
                className="flex shrink-0 items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--color-text-primary)',
                  color: 'var(--color-bg-primary)',
                }}
              >
                {isScanning ? (
                  <>
                    <SpinnerIcon />
                    <span>Scanning…</span>
                  </>
                ) : (
                  'Scan Now'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Inline error */}
      {error && (
        <p
          id={errorId}
          role="alert"
          aria-live="polite"
          className="text-xs"
          style={{ color: 'var(--color-critical)' }}
        >
          {error}
        </p>
      )}
    </div>
  )
}
