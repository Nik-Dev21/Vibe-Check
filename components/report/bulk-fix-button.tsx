'use client'

/**
 * components/report/bulk-fix-button.tsx
 * "Patch all" — generates + pushes fixes for all vulns with snippets in one PR.
 * States: idle → patching (animated step log) → done (file-changes modal) → error
 */

import { useState } from 'react'
import type { Vulnerability } from '@/lib/types'

type BulkState = 'idle' | 'patching' | 'done' | 'error'

interface BulkFixResult {
  filePath: string
  vulnTitle: string
  severity: string
  original: string
  fixed: string
  explanation: string
  status: 'patched' | 'skipped'
  skipReason?: string
}

interface BulkFixResponse {
  prUrl: string
  fixedCount: number
  skippedCount: number
  results: BulkFixResult[]
}

interface BulkPatchButtonProps {
  vulnerabilities: Vulnerability[]
  repoUrl: string
}

// ── Severity dot ──────────────────────────────────────────────────────────────

const SEV_COLOR: Record<string, string> = {
  CRITICAL: 'var(--color-critical)',
  HIGH:     'var(--color-high)',
  MEDIUM:   'var(--color-medium)',
  LOW:      'var(--color-low)',
}

function SevDot({ severity }: { severity: string }) {
  return (
    <span style={{
      display: 'inline-block',
      width: 7, height: 7, borderRadius: '50%',
      background: SEV_COLOR[severity] ?? 'var(--color-text-tertiary)',
      flexShrink: 0,
    }} />
  )
}

// ── Patch step log (animated, mimics fix-panel GeneratingScreen) ──────────────

const PATCH_STEPS = [
  'Analysing all patchable vulnerabilities…',
  'Generating patches with IBM Granite via watsonx…',
  'Applying fixes to file contents…',
  'Creating batch commit on fix branch…',
  'Opening pull request against main…',
]

function PatchingScreen({ count }: { count: number }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 480,
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        {/* Shimmer bar */}
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, var(--color-low), var(--color-clean), var(--color-low))',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.4s ease-in-out infinite',
        }} />

        <div style={{ padding: '24px 24px 28px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
              style={{ color: 'var(--color-low)', flexShrink: 0 }}>
              <circle cx="18" cy="18" r="3" />
              <circle cx="6" cy="6" r="3" />
              <path d="M13 6h3a2 2 0 012 2v7" />
              <line x1="6" y1="9" x2="6" y2="21" />
            </svg>
            <div>
              <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)' }}>
                Patching {count} vulnerabilit{count === 1 ? 'y' : 'ies'}
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                IBM Granite · minimal patches · single PR
              </div>
            </div>
          </div>

          {/* Step log */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {PATCH_STEPS.map((step, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                fontFamily: 'monospace', fontSize: 12,
                color: 'var(--color-text-secondary)',
                padding: '5px 0',
                opacity: 0,
                animation: `fade-up 360ms ${i * 380}ms forwards`,
              }}>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2 6l3 3 5-5" stroke="var(--color-clean)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {step}
              </div>
            ))}
          </div>

          {/* Spinning indicator */}
          <div style={{
            marginTop: 20, display: 'flex', alignItems: 'center', gap: 8,
            color: 'var(--color-text-tertiary)', fontFamily: 'monospace', fontSize: 11,
            opacity: 0,
            animation: `fade-up 360ms ${PATCH_STEPS.length * 380}ms forwards`,
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true"
              style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" stroke="var(--color-low)" strokeWidth="3"
                strokeDasharray="60" strokeDashoffset="20" strokeLinecap="round" />
            </svg>
            This may take 30–60s for large batches…
          </div>
        </div>
      </div>
    </div>
  )
}

// ── File changes modal ─────────────────────────────────────────────────────────

function ChangesModal({
  results,
  prUrl,
  fixedCount,
  skippedCount,
  onClose,
}: {
  results: BulkFixResult[]
  prUrl: string
  fixedCount: number
  skippedCount: number
  onClose: () => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: '100%', maxWidth: 680,
        maxHeight: '85vh',
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Modal header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px',
          borderBottom: '1px solid var(--color-border-subtle)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
              style={{ color: 'var(--color-clean)' }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 600, fontSize: 15, color: 'var(--color-text-primary)' }}>
              PR opened · {fixedCount} patch{fixedCount !== 1 ? 'es' : ''} applied
            </span>
            {skippedCount > 0 && (
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-medium)', marginLeft: 4 }}>
                ({skippedCount} skipped)
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 7,
                background: 'var(--color-clean)', color: '#000',
                fontSize: 12, fontWeight: 700, textDecoration: 'none',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              View PR →
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, borderRadius: 6,
                border: '1px solid var(--color-border)',
                background: 'transparent', color: 'var(--color-text-tertiary)',
                cursor: 'pointer',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* File list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {results.map((r, i) => {
            const isOpen = expanded === r.filePath + i
            const isPatched = r.status === 'patched'
            return (
              <div key={r.filePath + i} style={{
                borderBottom: '1px solid var(--color-border-subtle)',
              }}>
                {/* Row header — always visible */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '20px 1fr auto auto',
                    alignItems: 'center',
                    gap: 10,
                    padding: '11px 20px',
                    cursor: isPatched ? 'pointer' : 'default',
                  }}
                  onClick={() => isPatched && setExpanded(isOpen ? null : r.filePath + i)}
                >
                  {/* Status icon */}
                  {isPatched ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <circle cx="7" cy="7" r="6.5" stroke="var(--color-clean)" strokeWidth="1" />
                      <path d="M4 7l2 2 4-4" stroke="var(--color-clean)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <circle cx="7" cy="7" r="6.5" stroke="var(--color-medium)" strokeWidth="1" />
                      <path d="M7 4v3M7 9.5v.5" stroke="var(--color-medium)" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                  )}

                  {/* File path + vuln title */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {r.filePath}
                    </div>
                    <div style={{
                      fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text-tertiary)',
                      marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {isPatched ? r.vulnTitle : (r.skipReason ?? 'Skipped')}
                    </div>
                  </div>

                  {/* Severity */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    <SevDot severity={r.severity} />
                    <span style={{
                      fontFamily: 'monospace', fontSize: 10.5,
                      color: SEV_COLOR[r.severity] ?? 'var(--color-text-tertiary)',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                      {r.severity}
                    </span>
                  </div>

                  {/* Expand chevron */}
                  {isPatched && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"
                      style={{
                        color: 'var(--color-text-tertiary)',
                        transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 130ms',
                        flexShrink: 0,
                      }}>
                      <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>

                {/* Expanded diff */}
                {isOpen && isPatched && (
                  <div style={{ padding: '0 20px 16px' }}>
                    {/* Explanation */}
                    <div style={{
                      padding: '10px 12px',
                      background: 'var(--color-bg-tertiary)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 7,
                      marginBottom: 10,
                    }}>
                      <span className="uppercase-label" style={{ display: 'block', marginBottom: 4 }}>What changed</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                        {r.explanation}
                      </span>
                    </div>

                    {/* Inline diff */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <InlineDiff code={r.original} side="bad" label="Before" />
                      <InlineDiff code={r.fixed} side="good" label="After" />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Minimal inline diff block ──────────────────────────────────────────────────

function InlineDiff({ code, side, label }: { code: string; side: 'bad' | 'good'; label: string }) {
  const lines = (code || '').split('\n').slice(0, 20) // cap at 20 lines per side
  const bg = side === 'bad'
    ? 'color-mix(in srgb, var(--color-critical) 7%, var(--color-bg-primary))'
    : 'color-mix(in srgb, var(--color-clean) 6%, var(--color-bg-primary))'
  const dot = side === 'bad' ? 'var(--color-critical)' : 'var(--color-clean)'
  const prefix = side === 'bad' ? '-' : '+'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
        <span className="uppercase-label" style={{ fontSize: 9, color: 'var(--color-text-secondary)' }}>{label}</span>
      </div>
      <div style={{
        background: bg,
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 6,
        fontSize: 11,
        lineHeight: 1.6,
        padding: '6px 0',
        overflowX: 'auto',
        fontFamily: 'monospace',
      }}>
        {lines.map((line, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '20px 14px 1fr',
            alignItems: 'baseline',
          }}>
            <span style={{ color: 'var(--color-text-tertiary)', textAlign: 'right', paddingRight: 4, fontSize: 10, userSelect: 'none' }}>
              {i + 1}
            </span>
            <span style={{ color: dot, fontSize: 10, userSelect: 'none', textAlign: 'center' }}>
              {prefix}
            </span>
            <span style={{ paddingRight: 10, whiteSpace: 'pre', color: 'var(--color-text-secondary)' }}>
              {line}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function BulkPatchButton({ vulnerabilities, repoUrl }: BulkPatchButtonProps) {
  const patchable = vulnerabilities.filter((v) => !!v.codeSnippet)

  const [state, setState] = useState<BulkState>('idle')
  const [response, setResponse] = useState<BulkFixResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)

  if (patchable.length === 0) return null

  async function handlePatchAll() {
    setState('patching')
    setError(null)
    setResponse(null)

    try {
      const res = await fetch('/api/fix/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl,
          vulnerabilities: patchable.map((v) => ({
            vulnerabilityId: v.id,
            filePath: v.filePath,
            codeSnippet: v.codeSnippet,
            title: v.title,
            severity: v.severity,
            category: v.category,
          })),
        }),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? `Server error ${res.status}`)
      }

      const data = await res.json() as BulkFixResponse
      setResponse(data)
      setState('done')
      setShowModal(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk patch failed')
      setState('error')
    }
  }

  const isPatching = state === 'patching'

  return (
    <>
      {/* Fullscreen patching overlay */}
      {isPatching && <PatchingScreen count={patchable.length} />}

      {/* Changes modal after done */}
      {showModal && response && (
        <ChangesModal
          results={response.results}
          prUrl={response.prUrl}
          fixedCount={response.fixedCount}
          skippedCount={response.skippedCount}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* The button itself */}
      {state === 'idle' && (
        <button
          type="button"
          onClick={handlePatchAll}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '7px 16px', borderRadius: 7, border: 'none',
            background: 'var(--color-text-primary)', color: 'var(--color-bg-primary)',
            fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            transition: 'opacity 120ms',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.88' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="18" cy="18" r="3" />
            <circle cx="6" cy="6" r="3" />
            <path d="M13 6h3a2 2 0 012 2v7" />
            <line x1="6" y1="9" x2="6" y2="21" />
          </svg>
          Patch all · {patchable.length}
        </button>
      )}

      {/* Patching — button is disabled, overlay is the main feedback */}
      {isPatching && (
        <button type="button" disabled style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '7px 16px', borderRadius: 7, border: 'none',
          background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)',
          fontSize: 12.5, fontWeight: 700, cursor: 'not-allowed', opacity: 0.6,
          flexShrink: 0,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"
            style={{ animation: 'spin 1s linear infinite' }}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"
              strokeDasharray="60" strokeDashoffset="20" strokeLinecap="round" />
          </svg>
          Patching…
        </button>
      )}

      {/* Done — show green "View changes" button */}
      {state === 'done' && response && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-clean)' }}>
            {response.fixedCount} patch{response.fixedCount !== 1 ? 'es' : ''} applied
          </span>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 13px', borderRadius: 6, border: 'none',
              background: 'var(--color-clean)', color: '#000',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 7h10M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            View changes
          </button>
        </div>
      )}

      {/* Error state */}
      {state === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: 'monospace', fontSize: 11, color: 'var(--color-critical)',
            maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {error}
          </span>
          <button
            type="button"
            onClick={() => setState('idle')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 6,
              border: '1px solid var(--color-border)',
              background: 'transparent', color: 'var(--color-text-secondary)',
              fontSize: 12, cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}
    </>
  )
}
