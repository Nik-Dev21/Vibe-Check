'use client'

/**
 * components/scan-input.tsx
 * GitHub URL input with client-side validation + Scan Now button.
 * Submits to POST /api/scan and redirects to /scan/[scanId].
 * Uses mock scanId during Stream A development (one-line swap when API is live).
 */

import { useState, useId } from 'react'
import { useRouter } from 'next/navigation'

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
  const inputId = useId()
  const errorId = useId()

  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)

  function validate(url: string): string | null {
    if (!url.trim()) return 'Enter a GitHub repository URL to scan.'
    if (!GITHUB_REPO_RE.test(url.trim())) {
      return 'URL must be a valid GitHub repository (e.g. https://github.com/owner/repo).'
    }
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const validationError = validate(value)
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
        body: JSON.stringify({ repoUrl: value.trim() }),
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

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-2xl"
      noValidate
      aria-label="Scan a GitHub repository"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-2">
        {/* Visually hidden label (placeholder provides visible hint) */}
        <label htmlFor={inputId} className="sr-only">
          GitHub repository URL
        </label>

        <input
          id={inputId}
          type="url"
          name="repoUrl"
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

      {/* Inline error */}
      {error && (
        <p
          id={errorId}
          role="alert"
          aria-live="polite"
          className="mt-2 text-xs"
          style={{ color: 'var(--color-critical)' }}
        >
          {error}
        </p>
      )}
    </form>
  )
}
