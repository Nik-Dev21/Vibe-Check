'use client'

/**
 * components/report/bulk-fix-button.tsx
 * "Fix All Critical" button — generates fixes for all CRITICAL vulnerabilities
 * and pushes them as a single PR.
 */

import { useState } from 'react'
import type { Vulnerability } from '@/lib/types'

interface BulkFixButtonProps {
  vulnerabilities: Vulnerability[]
  repoUrl: string
}

function SpinnerIcon() {
  return (
    <svg
      width="14"
      height="14"
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

export default function BulkFixButton({ vulnerabilities, repoUrl }: BulkFixButtonProps) {
  const criticals = vulnerabilities.filter(
    (v) => v.severity === 'CRITICAL' && v.codeSnippet
  )

  const [state, setState] = useState<'idle' | 'fixing' | 'done' | 'error'>('idle')
  const [progress, setProgress] = useState('')
  const [prUrl, setPrUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (criticals.length === 0) return null

  async function handleBulkFix() {
    setState('fixing')
    setError(null)
    setProgress(`Generating fixes for ${criticals.length} critical vulnerabilities…`)

    try {
      const res = await fetch('/api/fix/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl,
          vulnerabilities: criticals.map((v) => ({
            vulnerabilityId: v.id,
            filePath: v.filePath,
            codeSnippet: v.codeSnippet,
            title: v.title,
            severity: v.severity,
          })),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? `Server error ${res.status}`)
      }

      const data = await res.json() as { prUrl: string; fixedCount: number }
      setPrUrl(data.prUrl)
      setProgress(`Fixed ${data.fixedCount} of ${criticals.length} vulnerabilities`)
      setState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk fix failed')
      setState('error')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {state === 'idle' && (
        <button
          type="button"
          onClick={handleBulkFix}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          style={{
            backgroundColor: 'var(--color-critical)',
            color: '#ffffff',
          }}
        >
          Fix All Critical ({criticals.length})
        </button>
      )}

      {state === 'fixing' && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold opacity-80 cursor-not-allowed"
            style={{
              backgroundColor: 'var(--color-critical)',
              color: '#ffffff',
            }}
          >
            <SpinnerIcon />
            Fixing…
          </button>
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {progress}
          </span>
        </div>
      )}

      {state === 'done' && prUrl && (
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold" style={{ color: 'var(--color-clean)' }}>
            {progress}
          </span>
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={{
              borderColor: 'var(--color-clean)',
              color: 'var(--color-clean)',
            }}
          >
            View PR →
          </a>
        </div>
      )}

      {state === 'error' && (
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--color-critical)' }}>
            {error}
          </span>
          <button
            type="button"
            onClick={handleBulkFix}
            className="rounded border px-3 py-1 text-xs font-semibold"
            style={{
              borderColor: '#333333',
              color: 'var(--color-text-secondary)',
            }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}
