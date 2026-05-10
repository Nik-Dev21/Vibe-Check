'use client'

/**
 * components/report/fix-panel.tsx
 * Fix lifecycle: idle → generating (step log) → generated (split diff) → pushing (loading) → pushed (PR link)
 */

import { useState, useRef } from 'react'
import type { Vulnerability, FixResponse, FixPushResponse } from '@/lib/types'

type FixState = 'idle' | 'generating' | 'generated' | 'pushing' | 'pushed'
type DiffMode = 'split' | 'unified'

// ── Syntax tokenizer (JS/TS/bash) ────────────────────────────────────────────

interface Token { t: string; cls?: string }

function tokenize(line: string): Token[] {
  const combined = /(\/\/.*$)|(#.*$)|("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')|(`(?:[^`\\]|\\.)*`)|(\b(?:import|export|from|const|let|var|function|return|if|else|new|await|async|throw|GET|POST|PUT|DELETE|PATCH)\b)|(\b(?:Response|Request|process|env|sql|auth|db)\b)|(\b\d+\b)/gm
  const parts: Token[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = combined.exec(line)) !== null) {
    if (m.index > last) parts.push({ t: line.slice(last, m.index) })
    let cls = 'tk-x'
    if (m[1] || m[2]) cls = 'tk-com'
    else if (m[3] || m[4] || m[5]) cls = 'tk-str'
    else if (m[6]) cls = 'tk-key'
    else if (m[7]) cls = 'tk-typ'
    else if (m[8]) cls = 'tk-num'
    parts.push({ t: m[0], cls })
    last = m.index + m[0].length
  }
  if (last < line.length) parts.push({ t: line.slice(last) })
  return parts
}

function tokenColor(cls?: string): string {
  switch (cls) {
    case 'tk-com': return 'var(--color-text-tertiary)'
    case 'tk-str': return 'var(--color-clean)'
    case 'tk-key': return 'var(--color-low)'
    case 'tk-typ': return 'var(--color-medium)'
    case 'tk-num': return 'var(--color-high)'
    default: return 'var(--color-text-primary)'
  }
}

// ── Code block ───────────────────────────────────────────────────────────────

function CodeBlock({
  code,
  side,
  startLine = 1,
  highlightLine,
}: {
  code: string
  side: 'bad' | 'good' | 'plain'
  startLine?: number
  highlightLine?: number
}) {
  const lines = (code || '').split('\n')
  const bg = side === 'bad'
    ? 'color-mix(in srgb, var(--color-critical) 7%, var(--color-bg-tertiary))'
    : side === 'good'
    ? 'color-mix(in srgb, var(--color-clean) 6%, var(--color-bg-tertiary))'
    : 'var(--color-bg-tertiary)'
  const hlBg = side === 'bad'
    ? 'color-mix(in srgb, var(--color-critical) 16%, transparent)'
    : 'color-mix(in srgb, var(--color-clean) 16%, transparent)'

  return (
    <div style={{
      background: bg,
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 8,
      fontSize: 12,
      lineHeight: 1.65,
      padding: '8px 0',
      overflowX: 'auto',
      flex: 1,
      minWidth: 0,
      fontFamily: 'monospace',
    }}>
      {lines.map((line, i) => {
        const lineNum = i + startLine
        const isHl = highlightLine != null && lineNum === highlightLine
        const parts = tokenize(line)
        return (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '40px 1fr',
            background: isHl ? hlBg : 'transparent',
          }}>
            <span style={{
              color: 'var(--color-text-tertiary)',
              textAlign: 'right',
              paddingRight: 10,
              userSelect: 'none',
              fontSize: 11,
            }}>
              {lineNum}
            </span>
            <span style={{ paddingRight: 14, whiteSpace: 'pre', color: 'var(--color-text-secondary)' }}>
              {parts.map((p, j) => (
                <span key={j} style={{ color: tokenColor(p.cls) }}>{p.t}</span>
              ))}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Diff side header ──────────────────────────────────────────────────────────

function DiffSide({
  title, sub, side, children,
}: {
  title: string; sub: string; side: 'bad' | 'good'; children: React.ReactNode
}) {
  const dot = side === 'bad' ? 'var(--color-critical)' : 'var(--color-clean)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />
        <span className="uppercase-label" style={{ color: 'var(--color-text-secondary)' }}>{title}</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>{sub}</span>
      </div>
      {children}
    </div>
  )
}

// ── Unified diff ─────────────────────────────────────────────────────────────

function UnifiedDiff({ original, fixed }: { original: string; fixed: string }) {
  const bad = original.split('\n')
  const good = fixed.split('\n')
  return (
    <div style={{
      background: 'var(--color-bg-tertiary)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 8,
      fontSize: 12,
      lineHeight: 1.65,
      padding: '8px 0',
      overflowX: 'auto',
      fontFamily: 'monospace',
    }}>
      {bad.map((l, i) => (
        <div key={'b' + i} style={{
          display: 'grid', gridTemplateColumns: '28px 1fr',
          background: 'color-mix(in srgb, var(--color-critical) 10%, transparent)',
        }}>
          <span style={{ textAlign: 'center', color: 'var(--color-critical)', userSelect: 'none', fontWeight: 600 }}>-</span>
          <span style={{ paddingRight: 14, whiteSpace: 'pre' }}>
            {tokenize(l).map((p, j) => <span key={j} style={{ color: tokenColor(p.cls) }}>{p.t}</span>)}
          </span>
        </div>
      ))}
      {good.map((l, i) => (
        <div key={'g' + i} style={{
          display: 'grid', gridTemplateColumns: '28px 1fr',
          background: 'color-mix(in srgb, var(--color-clean) 9%, transparent)',
        }}>
          <span style={{ textAlign: 'center', color: 'var(--color-clean)', userSelect: 'none', fontWeight: 600 }}>+</span>
          <span style={{ paddingRight: 14, whiteSpace: 'pre' }}>
            {tokenize(l).map((p, j) => <span key={j} style={{ color: tokenColor(p.cls) }}>{p.t}</span>)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Generating animation ──────────────────────────────────────────────────────

const GENERATING_STEPS = [
  'Reading vulnerability context…',
  'Analyzing surrounding code patterns…',
  'Composing minimal patch with watsonx Granite…',
  'Validating patch syntax…',
]

function GeneratingScreen() {
  return (
    <div style={{
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      {/* shimmer bar */}
      <div style={{
        height: 3,
        background: 'linear-gradient(90deg, var(--color-low), var(--color-clean), var(--color-low))',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.4s ease-in-out infinite',
      }} />
      <div style={{ padding: '18px 16px' }}>
        {GENERATING_STEPS.map((step, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            fontFamily: 'monospace', fontSize: 12,
            color: 'var(--color-text-secondary)',
            padding: '5px 0',
            opacity: 0,
            animation: `fade-up 360ms ${i * 350}ms forwards`,
          }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2 6l3 3 5-5" stroke="var(--color-clean)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {step}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Pushing loading screen ─────────────────────────────────────────────────

const PUSH_STEPS = [
  'Fetching current file from GitHub…',
  'Applying patch (minimal change)…',
  'Creating branch fix/{vuln-id}…',
  'Opening pull request against main…',
]

function PushingScreen() {
  return (
    <div style={{
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      <div style={{
        height: 3,
        background: 'linear-gradient(90deg, var(--color-medium), var(--color-low), var(--color-medium))',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.2s ease-in-out infinite',
      }} />
      <div style={{ padding: '18px 16px' }}>
        {PUSH_STEPS.map((step, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            fontFamily: 'monospace', fontSize: 12,
            color: 'var(--color-text-secondary)',
            padding: '5px 0',
            opacity: 0,
            animation: `fade-up 360ms ${i * 400}ms forwards`,
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" stroke="var(--color-low)" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20" strokeLinecap="round" />
            </svg>
            {step}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Segmented control ─────────────────────────────────────────────────────────

function Segmented({
  value, onChange, options,
}: {
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <div style={{
      display: 'inline-flex',
      padding: 2,
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      background: 'var(--color-bg-tertiary)',
    }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          style={{
            padding: '4px 10px',
            border: 'none',
            borderRadius: 4,
            background: value === o.value ? 'var(--color-bg-hover)' : 'transparent',
            color: value === o.value ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            fontFamily: 'monospace',
            fontSize: 11,
            cursor: 'pointer',
            transition: 'background 120ms, color 120ms',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── Main fix panel ────────────────────────────────────────────────────────────

interface FixPanelProps {
  vulnerability: Vulnerability
  repoUrl: string
  onClose: () => void
}

export default function FixPanel({ vulnerability, repoUrl, onClose }: FixPanelProps) {
  const [fixState, setFixState] = useState<FixState>('idle')
  const [fix, setFix] = useState<FixResponse | null>(null)
  const [prUrl, setPrUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [diffMode, setDiffMode] = useState<DiffMode>('split')
  const errorRef = useRef<HTMLParagraphElement>(null)

  const hasSnippet = !!vulnerability.codeSnippet

  async function handleGenerateFix() {
    if (!hasSnippet) {
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
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? `Server error ${res.status}`)
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
          originalCode: fix.original,
          fixedCode: fix.fixed,
          vulnerabilityId: vulnerability.id,
          vulnTitle: vulnerability.title,
          vulnSeverity: vulnerability.severity,
          vulnDescription: vulnerability.description,
          vulnLineNumber: vulnerability.lineNumber,
          fixExplanation: fix.explanation,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? `Server error ${res.status}`)
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
      style={{
        borderTop: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-primary)',
        padding: 16,
      }}
      aria-label={`Fix panel for: ${vulnerability.title}`}
    >
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14, gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Spark icon */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }}>
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" />
          </svg>
          <div>
            <div className="uppercase-label">Patch</div>
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
              {isGenerating && 'Generating patch · ~2s'}
              {fixState === 'idle' && 'Generate a fix using IBM Granite via watsonx'}
              {(fixState === 'generated' || isPushing || fixState === 'pushed') && 'watsonx.ai · minimal patch · review before pushing'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* Diff mode toggle — only when fix ready */}
          {(fixState === 'generated' || fixState === 'pushed') && (
            <Segmented
              value={diffMode}
              onChange={(v) => setDiffMode(v as DiffMode)}
              options={[{ value: 'split', label: 'Split' }, { value: 'unified', label: 'Unified' }]}
            />
          )}

          {/* Action buttons */}
          {fixState === 'idle' && (
            <button
              type="button"
              onClick={handleGenerateFix}
              disabled={!hasSnippet}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 6, border: 'none',
                background: 'var(--color-text-primary)', color: 'var(--color-bg-primary)',
                fontSize: 13, fontWeight: 600, cursor: hasSnippet ? 'pointer' : 'not-allowed',
                opacity: hasSnippet ? 1 : 0.4,
                transition: 'opacity 120ms',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              Generate fix
            </button>
          )}

          {isGenerating && (
            <button type="button" disabled style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 6, border: 'none',
              background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)',
              fontSize: 13, fontWeight: 600, cursor: 'not-allowed', opacity: 0.7,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: 'spin 1s linear infinite' }}>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20" strokeLinecap="round" />
              </svg>
              Generating…
            </button>
          )}

          {fixState === 'generated' && (
            <>
              <button
                type="button"
                onClick={handleGenerateFix}
                disabled={isDisabled}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 12px', borderRadius: 6,
                  border: '1px solid var(--color-border)',
                  background: 'transparent', color: 'var(--color-text-secondary)',
                  fontSize: 12, cursor: 'pointer',
                  transition: 'border-color 120ms, color 120ms',
                }}
              >
                Regenerate
              </button>
              <button
                type="button"
                onClick={handlePushPR}
                disabled={isDisabled}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', borderRadius: 6, border: 'none',
                  background: 'var(--color-text-primary)', color: 'var(--color-bg-primary)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  transition: 'opacity 120ms',
                }}
              >
                {/* PR icon */}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 012 2v7" /><line x1="6" y1="9" x2="6" y2="21" />
                </svg>
                Push as PR
              </button>
            </>
          )}

          {isPushing && (
            <button type="button" disabled style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 6, border: 'none',
              background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)',
              fontSize: 13, fontWeight: 600, cursor: 'not-allowed', opacity: 0.7,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: 'spin 1s linear infinite' }}>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20" strokeLinecap="round" />
              </svg>
              Opening PR…
            </button>
          )}

          {fixState === 'pushed' && prUrl && (
            <a
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 6, border: 'none',
                background: 'var(--color-clean)', color: '#000',
                fontSize: 13, fontWeight: 600, textDecoration: 'none',
              }}
            >
              {/* GitHub icon */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              View PR →
            </a>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close fix panel"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 6,
              border: '1px solid var(--color-border)',
              background: 'transparent', color: 'var(--color-text-tertiary)',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* File path */}
      <div style={{ fontFamily: 'monospace', fontSize: 11.5, color: 'var(--color-text-tertiary)', marginBottom: 14 }}>
        {vulnerability.filePath}
        {vulnerability.lineNumber != null && <span style={{ color: 'var(--color-text-secondary)' }}>:{vulnerability.lineNumber}</span>}
      </div>

      {/* ── Content area ── */}

      {/* Idle: prompt to generate */}
      {fixState === 'idle' && (
        <div style={{
          padding: '28px 20px',
          textAlign: 'center',
          color: 'var(--color-text-tertiary)',
          background: 'var(--color-bg-secondary)',
          border: '1px dashed var(--color-border)',
          borderRadius: 8,
        }}>
          {hasSnippet ? (
            <>
              <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
                Click <strong style={{ color: 'var(--color-text-primary)' }}>Generate fix</strong> to see the patch.
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 11, marginTop: 8, color: 'var(--color-text-tertiary)' }}>
                VibeCheck never auto-pushes — you always review the diff first.
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12 }}>No code snippet available. Fix generation requires a code snippet.</div>
          )}
        </div>
      )}

      {/* Generating: step log animation */}
      {isGenerating && <GeneratingScreen />}

      {/* Pushing: step log animation */}
      {isPushing && <PushingScreen />}

      {/* Generated / pushed: diff + what changed */}
      {fix && (fixState === 'generated' || fixState === 'pushed') && (
        <>
          {/* Pushed banner */}
          {fixState === 'pushed' && prUrl && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 8, marginBottom: 12,
              border: '1px solid color-mix(in srgb, var(--color-clean) 30%, transparent)',
              background: 'color-mix(in srgb, var(--color-clean) 7%, transparent)',
              color: 'var(--color-clean)',
              fontFamily: 'monospace', fontSize: 12,
            }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              PR opened against <strong style={{ marginLeft: 4 }}>main</strong>
              <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 4 }}>·</span>
              <a
                href={prUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--color-clean)', textDecoration: 'underline', marginLeft: 4 }}
              >
                {prUrl.split('/').slice(-2).join('#')}
              </a>
            </div>
          )}

          {/* Diff view */}
          {diffMode === 'split' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <DiffSide
                title="Before · vulnerable"
                sub={`${vulnerability.filePath}:${vulnerability.lineNumber ?? ''}`}
                side="bad"
              >
                <CodeBlock
                  code={fix.original}
                  side="bad"
                  startLine={vulnerability.lineNumber ? vulnerability.lineNumber - 1 : 1}
                  highlightLine={vulnerability.lineNumber}
                />
              </DiffSide>
              <DiffSide
                title="After · patched"
                sub="proposed by Granite"
                side="good"
              >
                <CodeBlock
                  code={fix.fixed}
                  side="good"
                  startLine={vulnerability.lineNumber ? vulnerability.lineNumber - 1 : 1}
                />
              </DiffSide>
            </div>
          ) : (
            <UnifiedDiff original={fix.original} fixed={fix.fixed} />
          )}

          {/* What changed */}
          <div style={{
            marginTop: 12,
            padding: '12px 14px',
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 8,
          }}>
            <div className="uppercase-label" style={{ marginBottom: 6 }}>What changed</div>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
              {fix.explanation}
            </div>
          </div>
        </>
      )}

      {/* Error */}
      {error && (
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }} role="alert">
          <p ref={errorRef} style={{ fontSize: 12, color: 'var(--color-critical)', flex: 1 }}>
            {error}
          </p>
          <button
            type="button"
            onClick={fixState === 'idle' ? handleGenerateFix : handleGenerateFix}
            style={{
              padding: '6px 12px', borderRadius: 6,
              border: '1px solid var(--color-border)',
              background: 'transparent', color: 'var(--color-text-secondary)',
              fontSize: 12, cursor: 'pointer', flexShrink: 0,
            }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
