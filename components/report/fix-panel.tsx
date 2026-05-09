'use client'

/**
 * components/report/fix-panel.tsx
 * Fix lifecycle: generate diff → review → push PR.
 * States: idle → generating → generated → pushing → pushed
 */

import { useState } from 'react'
import type { Vulnerability, FixResponse, FixPushResponse } from '@/lib/types'

interface FixPanelProps {
  vulnerability: Vulnerability
  repoUrl: string
  onClose: () => void
}

type FixState = 'idle' | 'generating' | 'generated' | 'pushing' | 'pushed'

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

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ExternalLinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">
      <path d="M5 2H2a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V7M7 1h4m0 0v4m0-4L5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Simple two-column diff viewer (before / after) */
function DiffViewer({ original, fixed }: { original: string; fixed: string }) {
  return (
    <div className="grid grid-cols-2 gap-2 overflow-hidden rounded" style={{ fontSize: '11px' }}>
      {/* Before */}
      <div>
        <p
          className="mb-1 px-1 text-xs font-mono font-semibold uppercase tracking-widest"
          style={{ color: 'var(--color-critical)' }}
        >
          Before
        </p>
        <pre
          className="overflow-x-auto rounded p-3 leading-relaxed"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-critical) 6%, var(--color-bg-tertiary))',
            border: '1px solid color-mix(in srgb, var(--color-critical) 20%, transparent)',
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-mono)',
            overscrollBehavior: 'contain',
          }}
        >
          <code>{original}</code>
        </pre>
      </div>

      {/* After */}
      <div>
        <p
          className="mb-1 px-1 text-xs font-mono font-semibold uppercase tracking-widest"
          style={{ color: 'var(--color-clean)' }}
        >
          After
        </p>
        <pre
          className="overflow-x-auto rounded p-3 leading-relaxed"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-clean) 6%, var(--color-bg-tertiary))',
            border: '1px solid color-mix(in srgb, var(--color-clean) 20%, transparent)',
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-mono)',
            overscrollBehavior: 'contain',
          }}
        >
          <code>{fixed}</code>
        </pre>
      </div>
    </div>
  )
}

export default function FixPanel({ vulnerability, repoUrl, onClose }: FixPanelProps) {
  const [fixState, setFixState] = useState<FixState>('idle')
  const [fix, setFix] = useState<FixResponse | null>(null)
  const [prUrl, setPrUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerateFix() {
    if (!vulnerability.codeSnippet) {
      setError('No code snippet available for this vulnerability.')
      return
    }

    setFixState('generating')
    setError(null)

    try {
      const res = await fetch('/api/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vulnerabilityId: vulnerability.id,
          filePath: vulnerability.filePath,
          codeSnippet: vulnerability.codeSnippet,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? `Server error ${res.status}`)
      }

      const data = await res.json() as FixResponse
      setFix(data)
      setFixState('generated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fix generation failed — try again.')
      setFixState('idle')
    }
  }

  async function handlePushPR() {
    if (!fix) return

    setFixState('pushing')
    setError(null)

    try {
      const res = await fetch('/api/fix/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl,
          filePath: vulnerability.filePath,
          fixedCode: fix.fixed,
          vulnerabilityId: vulnerability.id,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? `Server error ${res.status}`)
      }

      const data = await res.json() as FixPushResponse
      setPrUrl(data.prUrl)
      setFixState('pushed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Push failed — try again.')
      setFixState('generated')
    }
  }

  const isGenerating = fixState === 'generating'
  const isPushing = fixState === 'pushing'
  const isDisabled = isGenerating || isPushing

  return (
    <div
      className="rounded-lg border"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        borderColor: '#222222',
      }}
      aria-label={`Fix panel for: ${vulnerability.title}`}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: '#222222' }}
      >
        <div className="min-w-0">
          <p
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            Auto-Fix
          </p>
          <p
            className="truncate text-sm font-semibold"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {vulnerability.title}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close fix panel"
          className="ml-3 shrink-0 rounded p-1 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          <CloseIcon />
        </button>
      </div>

      {/* Body */}
      <div className="p-4">
        {/* File path */}
        <p
          className="mb-4 font-mono text-xs"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {vulnerability.filePath}
          {vulnerability.lineNumber != null && `:${vulnerability.lineNumber}`}
        </p>

        {/* Diff viewer */}
        {fix && (
          <>
            <DiffViewer original={fix.original} fixed={fix.fixed} />

            {/* Explanation */}
            <div
              className="mt-4 rounded p-3 text-xs leading-relaxed"
              style={{
                backgroundColor: 'var(--color-bg-tertiary)',
                border: '1px solid #1a1a1a',
                color: 'var(--color-text-secondary)',
              }}
            >
              <p className="mb-1 font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Explanation
              </p>
              <p>{fix.explanation}</p>
            </div>
          </>
        )}

        {/* Inline error */}
        {error && (
          <p
            className="mt-3 text-xs"
            role="alert"
            aria-live="polite"
            style={{ color: 'var(--color-critical)' }}
          >
            {error}
          </p>
        )}

        {/* PR link (after push) */}
        {prUrl && (
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center gap-2 rounded border px-4 py-2 text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={{
              borderColor: 'var(--color-clean)',
              color: 'var(--color-clean)',
              backgroundColor: 'color-mix(in srgb, var(--color-clean) 8%, transparent)',
            }}
            aria-live="polite"
          >
            <ExternalLinkIcon />
            View Pull Request →
          </a>
        )}

        {/* Action buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          {/* Generate Fix */}
          {fixState === 'idle' && (
            <button
              type="button"
              onClick={handleGenerateFix}
              disabled={isDisabled}
              className="flex items-center gap-2 rounded px-5 py-2 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--color-text-primary)',
                color: 'var(--color-bg-primary)',
              }}
            >
              Generate Fix
            </button>
          )}

          {/* Generating spinner */}
          {isGenerating && (
            <button
              type="button"
              disabled
              className="flex items-center gap-2 rounded px-5 py-2 text-sm font-semibold opacity-60 cursor-not-allowed"
              style={{
                backgroundColor: 'var(--color-text-primary)',
                color: 'var(--color-bg-primary)',
              }}
            >
              <SpinnerIcon />
              Generating fix…
            </button>
          )}

          {/* Push as PR (visible after fix generated) */}
          {(fixState === 'generated' || fixState === 'pushing') && (
            <>
              <button
                type="button"
                onClick={handleGenerateFix}
                disabled={isDisabled}
                className="flex items-center gap-2 rounded border px-4 py-2 text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60"
                style={{
                  borderColor: '#333333',
                  color: 'var(--color-text-secondary)',
                  backgroundColor: 'transparent',
                }}
              >
                Regenerate
              </button>

              <button
                type="button"
                onClick={handlePushPR}
                disabled={isDisabled}
                className="flex items-center gap-2 rounded px-5 py-2 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--color-text-primary)',
                  color: 'var(--color-bg-primary)',
                }}
              >
                {isPushing ? (
                  <>
                    <SpinnerIcon />
                    Pushing…
                  </>
                ) : (
                  'Push as PR'
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
