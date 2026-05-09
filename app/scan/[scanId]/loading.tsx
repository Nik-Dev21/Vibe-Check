'use client'

/**
 * app/scan/[scanId]/loading.tsx
 * Animated 5-phase progress indicator.
 * Polls GET /api/scan/[scanId] every 2 seconds.
 * Redirects to /scan/[scanId] when status is 'complete'.
 * Shows error inline when status is 'error'.
 */

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import type { ScanStatus } from '@/lib/types'

const PHASES: Array<{ key: ScanStatus['phase']; label: string }> = [
  { key: 'fetching',    label: 'Fetching repository files' },
  { key: 'classifying', label: 'Fast-pass classification (Featherless AI)' },
  { key: 'deep-scan',  label: 'Deep vulnerability scan (IBM Granite)' },
  { key: 'context',    label: 'Context analysis (Watson NLU)' },
  { key: 'building',   label: 'Building security report' },
]

const PHASE_INDEX: Record<ScanStatus['phase'], number> = {
  fetching:    0,
  classifying: 1,
  'deep-scan': 2,
  context:     3,
  building:    4,
  storing:     4,
}

type LoadState = 'loading' | 'error'

export default function ScanLoadingPage() {
  const router = useRouter()
  const params = useParams()
  const scanId = typeof params?.scanId === 'string' ? params.scanId : 'unknown'

  const [activePhaseIndex, setActivePhaseIndex] = useState(0)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/scan/${scanId}`, { cache: 'no-store' })

      if (!res.ok) {
        // Non-fatal for transient errors — keep polling
        return
      }

      const data = (await res.json()) as ScanStatus | { securityScore: number }

      // If the response has securityScore it's a full ScanReport — scan is done
      if ('securityScore' in data) {
        router.push(`/scan/${scanId}`)
        return
      }

      const status = data as ScanStatus

      if (status.status === 'complete') {
        router.push(`/scan/${scanId}`)
        return
      }

      if (status.status === 'error') {
        setLoadState('error')
        setErrorMessage(status.error ?? 'Scan failed — please try again.')
        return
      }

      // Still scanning — update active phase
      setActivePhaseIndex(PHASE_INDEX[status.phase] ?? 0)
    } catch {
      // Swallow network errors — keep polling
    }
  }, [scanId, router])

  useEffect(() => {
    poll() // immediate first call
    const interval = setInterval(poll, 2000)
    return () => clearInterval(interval)
  }, [poll])

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4"
      style={{ backgroundColor: 'var(--color-bg-primary)' }}
    >
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-10 text-center">
          <p
            className="mb-1 text-xs font-mono uppercase tracking-widest"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            Scanning
          </p>
          <p
            className="text-xl font-bold"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Analyzing your repository…
          </p>
        </div>

        {/* Phase steps */}
        <ol className="flex flex-col gap-4" aria-label="Scan progress steps">
          {PHASES.map((phase, idx) => {
            const isDone = idx < activePhaseIndex
            const isActive = idx === activePhaseIndex && loadState === 'loading'
            const isPending = idx > activePhaseIndex

            return (
              <li
                key={phase.key}
                className="flex items-center gap-4"
              >
                {/* Step indicator */}
                <div
                  className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
                  style={{
                    borderColor: isDone
                      ? 'var(--color-clean)'
                      : isActive
                      ? 'var(--color-text-primary)'
                      : 'var(--color-border-subtle)',
                    backgroundColor: isDone
                      ? 'var(--color-clean)'
                      : 'transparent',
                  }}
                >
                  {isDone ? (
                    /* Checkmark */
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M2 6l3 3 5-5"
                        stroke="var(--color-bg-primary)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : isActive ? (
                    /* Pulsing dot */
                    <span
                      className="h-2.5 w-2.5 rounded-full motion-safe:animate-pulse"
                      style={{ backgroundColor: 'var(--color-text-primary)' }}
                      aria-hidden="true"
                    />
                  ) : (
                    /* Empty pending */
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: 'var(--color-border-subtle)' }}
                      aria-hidden="true"
                    />
                  )}
                </div>

                {/* Label */}
                <span
                  className="text-sm"
                  style={{
                    color: isDone
                      ? 'var(--color-clean)'
                      : isActive
                      ? 'var(--color-text-primary)'
                      : 'var(--color-text-tertiary)',
                    fontWeight: isActive ? 600 : 400,
                  }}
                  aria-live={isActive ? 'polite' : undefined}
                >
                  {phase.label}
                  {isActive && (
                    <span aria-live="polite" className="ml-1">
                      …
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ol>

        {/* Error state */}
        {loadState === 'error' && (
          <div
            className="mt-8 rounded-lg border p-4"
            role="alert"
            aria-live="assertive"
            style={{
              borderColor: 'var(--color-critical)',
              backgroundColor: 'rgba(255, 59, 48, 0.08)',
            }}
          >
            <p
              className="mb-3 text-sm font-semibold"
              style={{ color: 'var(--color-critical)' }}
            >
              Scan Failed
            </p>
            <p className="mb-4 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              {errorMessage}
            </p>
            <a
              href="/"
              className="inline-block rounded px-4 py-2 text-xs font-semibold transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
              style={{
                backgroundColor: 'var(--color-text-primary)',
                color: 'var(--color-bg-primary)',
              }}
            >
              Try a Different Repository
            </a>
          </div>
        )}

        {/* Scan ID */}
        <p
          className="mt-10 text-center text-xs font-mono"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          <span translate="no">{scanId}</span>
        </p>
      </div>
    </div>
  )
}
