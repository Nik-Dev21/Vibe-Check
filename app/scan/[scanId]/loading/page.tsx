'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import type { ScanStatus } from '@/lib/types'

// ── Constants ────────────────────────────────────────────────────────────────

const SEV_COLOR: Record<string, string> = {
  HIGH:    'var(--color-high)',
  MEDIUM:  'var(--color-medium)',
  LOW:     'var(--color-low)',
  CLEAN:   'var(--color-clean)',
  error:   'var(--color-critical)',
}

const PHASE_STEPS: Array<{
  phase: ScanStatus['phase'] | 'done'
  label: string
  detail: string
}> = [
  { phase: 'fetching',    label: 'Cloning repository',  detail: 'git clone --depth=1' },
  { phase: 'classifying', label: 'Indexing files',       detail: 'building file list' },
  { phase: 'deep-scan',   label: 'Static analysis',      detail: 'Featherless + watsonx' },
  { phase: 'building',    label: 'Generating report',    detail: 'scoring + ranking' },
  { phase: 'done',        label: 'Complete',             detail: 'redirecting…' },
]

const PHASE_ORDER: Record<string, number> = {
  fetching: 0, classifying: 1, 'deep-scan': 2, context: 2, building: 3, storing: 3,
}

// ── Radar ────────────────────────────────────────────────────────────────────

function RadarVisual({
  pct,
  scannedFiles,
}: {
  pct: number
  scannedFiles: Array<{ path: string; riskLevel: string }>
}) {
  const size = 280
  const cx = size / 2, cy = size / 2

  // Pin positions deterministically by index so they don't jump
  const dots = scannedFiles.slice(-24).map((f, i) => {
    const angle = (i / 24) * Math.PI * 2
    const r = 48 + (i * 5) % 88
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, riskLevel: f.riskLevel, i }
  })

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {[0.38, 0.62, 0.88].map((s, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: cx - cx * s, top: cy - cy * s,
          width: size * s, height: size * s,
          borderRadius: '50%',
          border: '1px solid var(--color-border-subtle)',
          opacity: 0.5 - i * 0.12,
        }} />
      ))}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        border: '1px solid var(--color-border)',
        boxShadow: 'inset 0 0 48px rgba(74,158,255,0.1), 0 0 32px rgba(74,158,255,0.05)',
        animation: 'radial-pulse 4s ease-in-out infinite',
      }} />
      {/* sweep line */}
      <div style={{
        position: 'absolute', left: cx, top: cy,
        width: cx - 4, height: 2,
        transformOrigin: 'left center',
        animation: 'radar-sweep 3.6s linear infinite',
        background: 'linear-gradient(90deg, rgba(74,158,255,0.7), transparent)',
        boxShadow: '0 0 8px rgba(74,158,255,0.5)',
      }} />
      <div style={{
        position: 'absolute', left: cx, top: cy,
        width: cx, height: cx,
        transformOrigin: 'left top',
        animation: 'radar-sweep 3.6s linear infinite',
        background: 'conic-gradient(from 0deg, rgba(74,158,255,0.15), transparent 55deg)',
        borderRadius: '0 100% 0 0',
      }} />
      {dots.map((d) => {
        const color = SEV_COLOR[d.riskLevel] ?? SEV_COLOR.CLEAN
        return (
          <span key={d.i} style={{
            position: 'absolute',
            left: d.x - 3, top: d.y - 3,
            width: 6, height: 6, borderRadius: '50%',
            background: color,
            boxShadow: `0 0 8px ${color}`,
            animation: 'detect-pop 500ms cubic-bezier(.2,.7,.2,1) both',
          }} />
        )
      })}
      {/* crosshair */}
      <div style={{ position: 'absolute', left: cx - 1, top: cy - 10, width: 2, height: 20, background: 'var(--color-border)' }} />
      <div style={{ position: 'absolute', left: cx - 10, top: cy - 1, width: 20, height: 2, background: 'var(--color-border)' }} />
      {/* center pct */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <div style={{
          fontFamily: 'monospace', fontSize: 46, fontWeight: 600,
          letterSpacing: '-0.04em', color: 'var(--color-text-primary)', lineHeight: 1,
          textShadow: '0 0 24px rgba(255,255,255,0.12)',
        }}>
          {Math.round(pct * 100)}
          <span style={{ fontSize: 18, color: 'var(--color-text-tertiary)', marginLeft: 3 }}>%</span>
        </div>
        <div className="uppercase-label" style={{ marginTop: 6 }}>scanning</div>
      </div>
    </div>
  )
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function StripedProgress({ pct }: { pct: number }) {
  return (
    <div style={{ position: 'relative', height: 5, borderRadius: 3, background: 'var(--color-border-subtle)', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: `${pct * 100}%`,
        background: 'linear-gradient(90deg, var(--color-low), white)',
        borderRadius: 3,
        transition: 'width 200ms linear',
        boxShadow: '0 0 10px rgba(74,158,255,0.5)',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.15) 0 8px, transparent 8px 16px)',
          animation: 'stripes-move 600ms linear infinite',
          mixBlendMode: 'overlay',
          borderRadius: 3,
        }} />
      </div>
      <div style={{
        position: 'absolute',
        left: `calc(${pct * 100}% - 1px)`,
        top: -2, bottom: -2, width: 2,
        background: 'white',
        boxShadow: '0 0 10px white, 0 0 20px rgba(74,158,255,0.5)',
        opacity: pct > 0 && pct < 1 ? 1 : 0,
        transition: 'left 200ms linear, opacity 200ms',
      }} />
    </div>
  )
}

// ── Step pills ────────────────────────────────────────────────────────────────

function StepPills({ phase, progress, done }: { phase: string; progress: number; done: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${PHASE_STEPS.length}, 1fr)`, gap: 8 }}>
      {PHASE_STEPS.map((s, i) => {
        const currentOrder = done ? 99 : (PHASE_ORDER[phase] ?? 0)
        const stepOrder = PHASE_ORDER[s.phase] ?? (s.phase === 'done' ? 4 : 99)
        const state = done && s.phase === 'done' ? 'active'
          : currentOrder > stepOrder ? 'done'
          : currentOrder === stepOrder && s.phase !== 'done' ? 'active'
          : 'pending'

        return (
          <div key={s.phase} style={{
            padding: '10px',
            border: `1px solid ${state === 'active' ? 'var(--color-low)' : state === 'done' ? 'rgba(48,209,88,0.3)' : 'var(--color-border-subtle)'}`,
            borderRadius: 8,
            background: state === 'active' ? 'rgba(74,158,255,0.05)' : state === 'done' ? 'rgba(48,209,88,0.04)' : 'transparent',
            transition: 'all 240ms',
            opacity: state === 'pending' ? 0.4 : 1,
            position: 'relative', overflow: 'hidden',
          }}>
            {state === 'active' && (
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: 'linear-gradient(90deg, transparent, rgba(74,158,255,0.1), transparent)',
                animation: 'shimmer 1.6s ease-in-out infinite',
              }} />
            )}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 10, fontFamily: 'monospace',
              color: state === 'done' ? 'var(--color-clean)' : state === 'active' ? 'var(--color-low)' : 'var(--color-text-tertiary)',
              marginBottom: 5,
            }}>
              {state === 'done' ? (
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : state === 'active' ? (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: 'spin 1s linear infinite' }}>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20" strokeLinecap="round" />
                </svg>
              ) : (
                <span style={{ width: 7, height: 7, borderRadius: '50%', border: '1px solid currentColor', display: 'inline-block' }} />
              )}
              {String(i + 1).padStart(2, '0')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-primary)', lineHeight: 1.3, fontWeight: 500 }}>{s.label}</div>
            <div style={{ fontSize: 9.5, color: 'var(--color-text-tertiary)', marginTop: 3, fontFamily: 'monospace' }}>{s.detail}</div>
            {state === 'active' && s.phase === 'deep-scan' && (
              <div style={{ marginTop: 6, fontSize: 9, color: 'var(--color-low)', fontFamily: 'monospace' }}>
                {progress}%
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── File list ────────────────────────────────────────────────────────────────

function FileList({
  files,
  currentFile,
  total,
}: {
  files: Array<{ path: string; riskLevel: string }>
  currentFile: string | null | undefined
  total: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [files.length])

  return (
    <div style={{
      flex: 1, minHeight: 0,
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 10,
      background: 'var(--color-bg-secondary)',
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '9px 14px',
        borderBottom: '1px solid var(--color-border-subtle)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'var(--color-bg-tertiary)',
      }}>
        <span className="uppercase-label">Files</span>
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {files.length}{total > 0 ? ` / ${total}` : ''}
        </span>
      </div>
      <div ref={ref} className="scroll" style={{ flex: 1, minHeight: 0, padding: '6px 0', fontFamily: 'monospace', fontSize: 12 }}>
        {files.map((f, i) => {
          const color = SEV_COLOR[f.riskLevel] ?? SEV_COLOR.CLEAN
          const isIssue = f.riskLevel !== 'CLEAN' && f.riskLevel !== 'LOW'
          return (
            <div key={f.path + i} className="fade-up" style={{
              padding: '3px 14px',
              display: 'flex', alignItems: 'center', gap: 8,
              color: isIssue ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
              borderLeft: isIssue ? `2px solid ${color}` : '2px solid transparent',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {f.path}
              </span>
              {isIssue && (
                <span style={{ fontSize: 9, color, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, flexShrink: 0 }}>
                  {f.riskLevel}
                </span>
              )}
            </div>
          )
        })}
        {currentFile && (
          <div style={{ padding: '3px 14px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-secondary)', opacity: 0.65 }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20" strokeLinecap="round" />
            </svg>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentFile}</span>
            <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>scanning…</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Counter row ───────────────────────────────────────────────────────────────

function CounterRow({
  filesScanned,
  total,
  issuesFound,
  pct,
  elapsedMs,
}: {
  filesScanned: number
  total: number
  issuesFound: number
  pct: number
  elapsedMs: number
}) {
  const stats = [
    { label: 'Files',   value: total > 0 ? `${filesScanned} / ${total}` : `${filesScanned}`, color: 'var(--color-text-primary)' },
    { label: 'Issues',  value: String(issuesFound), color: issuesFound > 0 ? 'var(--color-critical)' : 'var(--color-text-primary)' },
    { label: 'Progress', value: `${Math.round(pct * 100)}%`, color: 'var(--color-low)' },
    { label: 'Elapsed', value: `${(elapsedMs / 1000).toFixed(0)}s`, color: 'var(--color-text-primary)' },
  ]
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 10, overflow: 'hidden',
    }}>
      {stats.map((s, i) => (
        <div key={s.label} style={{
          padding: '12px 16px',
          borderRight: i < stats.length - 1 ? '1px solid var(--color-border-subtle)' : 'none',
          background: 'var(--color-bg-secondary)',
        }}>
          <div className="uppercase-label" style={{ marginBottom: 5 }}>{s.label}</div>
          <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 600, color: s.color, letterSpacing: '-0.02em', lineHeight: 1 }}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Live terminal log ─────────────────────────────────────────────────────────

function TerminalLog({ lines }: { lines: Array<{ text: string; color?: string }> }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [lines.length])

  return (
    <div ref={ref} className="scroll" style={{
      height: 130,
      padding: '12px 16px',
      fontFamily: 'monospace',
      fontSize: 11.5,
      background: '#040404',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 10,
      color: 'var(--color-text-secondary)',
      lineHeight: 1.75,
    }}>
      {lines.map((l, i) => (
        <div key={i} className="fade-up" style={{ color: l.color ?? 'var(--color-text-secondary)' }}>
          {l.text}
        </div>
      ))}
      <span style={{ color: 'var(--color-text-primary)', animation: 'blink 1s steps(2) infinite' }}>▍</span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ScanLoadingPage() {
  const router = useRouter()
  const params = useParams()
  const scanId = typeof params?.scanId === 'string' ? params.scanId : 'unknown'

  const startTimeRef = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)

  // Real poll state
  const [pollStatus, setPollStatus] = useState<ScanStatus | null>(null)
  const [scanDone, setScanDone] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

  // Derived display values — use real data when available, fallback to estimate
  const totalFiles = pollStatus?.totalFiles ?? 0
  const scannedFiles = pollStatus?.scannedFiles ?? []
  const currentFile = pollStatus?.currentFile
  const issuesFound = pollStatus?.issuesFound ?? 0
  const phase = pollStatus?.phase ?? 'fetching'
  const progress = pollStatus?.progress ?? 0
  const repoName = pollStatus?.repoName ?? scanId
  const repoUrl = pollStatus?.repoUrl ?? ''

  // Smooth progress: use real progress from poll, but never go backwards
  const smoothPctRef = useRef(0)
  const displayPct = Math.max(smoothPctRef.current, progress / 100)
  smoothPctRef.current = displayPct

  // Elapsed timer
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startTimeRef.current), 500)
    return () => clearInterval(id)
  }, [])

  // Build terminal log lines from poll state
  const terminalLines = useRef<Array<{ text: string; color?: string }>>([
    { text: `$ vibecheck scan ${scanId}`, color: 'var(--color-text-primary)' },
  ])
  const lastPhaseRef = useRef('')
  const lastFileCountRef = useRef(0)

  useEffect(() => {
    if (!pollStatus) return

    if (pollStatus.phase !== lastPhaseRef.current) {
      lastPhaseRef.current = pollStatus.phase
      const phaseLines: Record<string, { text: string; color?: string }> = {
        fetching:    { text: '[clone] fetching repo tree…' },
        classifying: { text: `[index] ${totalFiles > 0 ? `${totalFiles} files` : 'indexing…'}` },
        'deep-scan': { text: '[scan ] Featherless fast-pass + watsonx deep scan', color: 'var(--color-low)' },
        building:    { text: '[score] assembling report + calculating score…', color: 'var(--color-clean)' },
        storing:     { text: '[store] saving to IBM COS…' },
        context:     { text: '[nlu  ] Watson NLU context enrichment…' },
      }
      const entry = phaseLines[pollStatus.phase]
      if (entry) terminalLines.current = [...terminalLines.current, entry]
    }

    // Log notable files as they appear
    if (scannedFiles.length > lastFileCountRef.current) {
      const newFiles = scannedFiles.slice(lastFileCountRef.current)
      lastFileCountRef.current = scannedFiles.length
      for (const f of newFiles) {
        if (f.riskLevel === 'HIGH' || f.riskLevel === 'MEDIUM') {
          const color = f.riskLevel === 'HIGH' ? 'var(--color-high)' : 'var(--color-medium)'
          terminalLines.current = [
            ...terminalLines.current,
            { text: `[scan ] ${f.riskLevel.toLowerCase().padEnd(6)} → ${f.path}`, color },
          ]
        }
      }
    }

    if (scanDone) {
      terminalLines.current = [
        ...terminalLines.current,
        { text: `[done ] report ready ✓  issues=${issuesFound}`, color: 'var(--color-clean)' },
      ]
    }
  }, [pollStatus, scanDone]) // eslint-disable-line react-hooks/exhaustive-deps

  // Complete when scan done
  useEffect(() => {
    if (scanDone) {
      setTimeout(() => router.push(`/scan/${scanId}`), 500)
    }
  }, [scanDone, scanId, router])

  // Poll
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/scan/${scanId}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json() as ScanStatus | { status: string }
      if (data.status === 'complete') { setScanDone(true); return }
      if (data.status === 'error') {
        setScanError((data as ScanStatus).error ?? 'Scan failed — please try again.')
        return
      }
      setPollStatus(data as ScanStatus)
    } catch { /* swallow — keep polling */ }
  }, [scanId])

  useEffect(() => {
    poll()
    const interval = setInterval(poll, 2000)
    return () => clearInterval(interval)
  }, [poll])

  const pct = scanDone ? 1 : displayPct

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: 'var(--color-bg-primary)',
      display: 'grid',
      gridTemplateRows: 'auto 1fr auto',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Ambient grid */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          repeating-linear-gradient(90deg, var(--color-border-subtle) 0 1px, transparent 1px 96px),
          repeating-linear-gradient(0deg,  var(--color-border-subtle) 0 1px, transparent 1px 96px)
        `,
        opacity: 0.3,
        maskImage: 'radial-gradient(ellipse 70% 60% at center, black 30%, transparent 80%)',
        WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at center, black 30%, transparent 80%)',
      }} />

      {/* Header */}
      <header style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center',
        gap: 24,
        padding: '12px 24px',
        borderBottom: '1px solid var(--color-border-subtle)',
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--color-text-primary)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/vibecheck_logo.png" alt="" width={20} height={20} style={{ filter: 'brightness(0) invert(1)', objectFit: 'contain' }} />
          <span style={{ fontFamily: 'Poppins, ui-sans-serif, sans-serif', fontWeight: 700, fontSize: 14 }}>VibeCheck</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', fontFamily: 'monospace', fontSize: 12 }}>
          <span style={{ color: 'var(--color-text-tertiary)' }}>scanning</span>
          {repoUrl ? (
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-text-primary)', textDecoration: 'none', fontWeight: 500 }}
            >
              {repoName}
            </a>
          ) : (
            <span style={{ color: 'var(--color-text-primary)' }}>{repoName}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="uppercase-label">ETA</span>
          <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text-primary)' }}>
            {scanDone ? '0s' : `~${Math.max(0, 60 - Math.round(elapsed / 1000))}s`}
          </span>
          <a
            href="/"
            style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '5px 10px', borderRadius: 6,
              border: '1px solid var(--color-border)',
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              fontSize: 12, textDecoration: 'none',
            }}
          >
            Cancel
          </a>
        </div>
      </header>

      {/* Main */}
      <main style={{
        position: 'relative',
        padding: '18px 24px',
        display: 'grid',
        gridTemplateColumns: '1fr 300px 1fr',
        gap: 18,
        minHeight: 0,
        maxWidth: 1380,
        width: '100%',
        margin: '0 auto',
      }}>
        {/* Left: counters + file list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
          <CounterRow
            filesScanned={scannedFiles.length}
            total={totalFiles}
            issuesFound={issuesFound}
            pct={pct}
            elapsedMs={elapsed}
          />
          <FileList
            files={scannedFiles}
            currentFile={currentFile}
            total={totalFiles}
          />
        </div>

        {/* Center: radar */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
          gap: 20, paddingTop: 4,
        }}>
          <RadarVisual pct={pct} scannedFiles={scannedFiles} />
          <div style={{ textAlign: 'center', maxWidth: 280 }}>
            <div className="uppercase-label" style={{ marginBottom: 6 }}>Currently</div>
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text-primary)', minHeight: 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
              {scanDone ? 'report ready ✓' : currentFile ?? (phase === 'fetching' ? 'cloning repo…' : 'processing…')}
            </div>
          </div>
        </div>

        {/* Right: step pills + error */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
          <StepPills phase={phase} progress={progress} done={scanDone} />

          {scanError && (
            <div style={{
              padding: 14, borderRadius: 8,
              border: '1px solid var(--color-critical)',
              background: 'rgba(255,59,48,0.07)',
            }} role="alert">
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-critical)', marginBottom: 6 }}>Scan Failed</p>
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>{scanError}</p>
              <a href="/" style={{
                display: 'inline-block', padding: '7px 12px', borderRadius: 6,
                background: 'var(--color-text-primary)', color: 'var(--color-bg-primary)',
                fontSize: 12, fontWeight: 600, textDecoration: 'none',
              }}>
                Try Another Repo
              </a>
            </div>
          )}
        </div>
      </main>

      {/* Footer: progress bar + terminal */}
      <footer style={{
        position: 'relative',
        padding: '12px 24px 18px',
        borderTop: '1px solid var(--color-border-subtle)',
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="uppercase-label" style={{ minWidth: 72 }}>Progress</span>
          <div style={{ flex: 1 }}>
            <StripedProgress pct={pct} />
          </div>
          <span style={{ fontFamily: 'monospace', minWidth: 48, fontSize: 12, color: 'var(--color-text-primary)', textAlign: 'right' }}>
            {(pct * 100).toFixed(1)}%
          </span>
        </div>
        <TerminalLog lines={terminalLines.current} />
      </footer>
    </div>
  )
}
