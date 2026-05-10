'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import type { ScanStatus } from '@/lib/types'

// ── Constants ────────────────────────────────────────────────────────────────

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--color-critical)',
  high:     'var(--color-high)',
  medium:   'var(--color-medium)',
  low:      'var(--color-low)',
  clean:    'var(--color-clean)',
}

const STEPS = [
  { label: 'Cloning repository',   detail: 'git clone --depth=1',         until: 0.15 },
  { label: 'Indexing files',        detail: '247 files · 18,432 LOC',      until: 0.30 },
  { label: 'Static analysis',       detail: 'AST · taint · dataflow',      until: 0.55 },
  { label: 'Granite 3.2 review',    detail: 'via Featherless inference',   until: 0.85 },
  { label: 'Generating report',     detail: 'scoring + ranking',           until: 1.00 },
]

const LOG_SCRIPT = [
  { at: 0.01, line: '$ vibecheck scan github.com/your-org/your-repo', sev: '' },
  { at: 0.05, line: '[clone] depth=1 branch=main → ok (1.2s)', sev: '' },
  { at: 0.18, line: '[index] 247 files · 18,432 LOC · ts/tsx 78%', sev: '' },
  { at: 0.22, line: '[scan ] secrets       → 1 high-confidence match', sev: 'critical' },
  { at: 0.30, line: '[scan ] taint         → tracing 14 sources → 8 sinks', sev: '' },
  { at: 0.38, line: '[scan ] sql injection → api/users/route.ts:24', sev: 'critical' },
  { at: 0.46, line: '[scan ] auth          → 2 unguarded handlers', sev: 'high' },
  { at: 0.55, line: '[gran] dispatch → ibm-granite-3.2-8b-instruct', sev: '' },
  { at: 0.62, line: '[gran] context: 47 KB · response: 2.3s', sev: '' },
  { at: 0.70, line: '[scan ] deps          → 1 CVE (next@14.1.0)', sev: 'high' },
  { at: 0.78, line: '[scan ] headers       → CSP missing, CORS permissive', sev: 'medium' },
  { at: 0.88, line: '[score] critical=3  high=5  medium=8  low=12', sev: '' },
  { at: 0.95, line: '[score] composite = 42/100', sev: '' },
  { at: 0.99, line: '[done ] report ready ✓', sev: 'clean' },
]

const SCAN_FILES = [
  'app/(dashboard)/sidebar.tsx', 'app/(dashboard)/header.tsx', 'app/(dashboard)/nav.tsx',
  'components/ui/button.tsx', 'components/ui/card.tsx', 'components/ui/input.tsx',
  'components/ui/label.tsx', 'components/ui/select.tsx', 'components/ui/tabs.tsx',
  'app/(dashboard)/footer.tsx', 'app/(dashboard)/grid.tsx', 'app/(dashboard)/modal.tsx',
  'lib/db.ts', 'lib/utils.ts', '.env.production', 'app/api/auth/login.ts',
  'app/api/users/route.ts', 'app/api/admin/route.ts', 'app/(dashboard)/notes/[id]/page.tsx',
  'package.json', 'lib/stripe.ts', 'next.config.js', 'middleware.ts',
]

const FILE_SEVS: Record<string, string> = {
  'lib/db.ts': 'critical',
  '.env.production': 'critical',
  'app/api/auth/login.ts': 'high',
  'app/api/users/route.ts': 'critical',
  'app/api/admin/route.ts': 'high',
  'app/(dashboard)/notes/[id]/page.tsx': 'high',
  'package.json': 'high',
  'lib/stripe.ts': 'high',
  'next.config.js': 'medium',
  'middleware.ts': 'low',
  'lib/utils.ts': 'low',
}

// ── Radar visual ─────────────────────────────────────────────────────────────

function RadarVisual({ pct, scannedFiles }: { pct: number; scannedFiles: string[] }) {
  const size = 300
  const cx = size / 2, cy = size / 2

  const dots = useMemo(() => {
    return scannedFiles.slice(-18).map((path, i) => {
      const angle = (i / 18) * Math.PI * 2
      const r = 60 + (i * 4) % 90
      return {
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        sev: FILE_SEVS[path] ?? 'clean',
        i,
      }
    })
  }, [scannedFiles.length]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {/* concentric rings */}
      {[0.4, 0.65, 0.9].map((s, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: cx - (cx * s), top: cy - (cy * s),
          width: size * s, height: size * s,
          borderRadius: '50%',
          border: '1px solid var(--color-border-subtle)',
          opacity: 0.6 - i * 0.15,
        }} />
      ))}
      {/* outer glow ring */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        border: '1px solid var(--color-border)',
        boxShadow: 'inset 0 0 60px rgba(74,158,255,0.12), 0 0 40px rgba(74,158,255,0.06)',
        animation: 'radial-pulse 4s ease-in-out infinite',
      }} />
      {/* sweeping line */}
      <div style={{
        position: 'absolute', left: cx, top: cy,
        width: cx - 4, height: 2,
        transformOrigin: 'left center',
        animation: 'radar-sweep 3.6s linear infinite',
        background: 'linear-gradient(90deg, rgba(74,158,255,0.7), transparent)',
        boxShadow: '0 0 8px rgba(74,158,255,0.5)',
      }} />
      {/* sweeping cone */}
      <div style={{
        position: 'absolute', left: cx, top: cy,
        width: cx, height: cx,
        transformOrigin: 'left top',
        animation: 'radar-sweep 3.6s linear infinite',
        background: 'conic-gradient(from 0deg, rgba(74,158,255,0.18), transparent 60deg)',
        borderRadius: '0 100% 0 0',
      }} />
      {/* file dots */}
      {dots.map((d) => {
        const color = SEV_COLOR[d.sev] ?? SEV_COLOR.clean
        return (
          <span key={d.i} style={{
            position: 'absolute',
            left: d.x - 3, top: d.y - 3,
            width: 6, height: 6, borderRadius: '50%',
            background: color,
            boxShadow: `0 0 8px ${color}`,
            animation: 'detect-pop 600ms cubic-bezier(.2,.7,.2,1) both',
          }} />
        )
      })}
      {/* crosshair */}
      <div style={{ position: 'absolute', left: cx - 1, top: cy - 12, width: 2, height: 24, background: 'var(--color-border-strong, #2a2a2a)' }} />
      <div style={{ position: 'absolute', left: cx - 12, top: cy - 1, width: 24, height: 2, background: 'var(--color-border-strong, #2a2a2a)' }} />
      {/* center % */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <div style={{
          fontFamily: 'monospace',
          fontSize: 52, fontWeight: 600,
          letterSpacing: '-0.04em',
          color: 'var(--color-text-primary)',
          lineHeight: 1,
          textShadow: '0 0 24px rgba(255,255,255,0.15)',
        }}>
          {Math.round(pct * 100)}
          <span style={{ fontSize: 20, color: 'var(--color-text-tertiary)', marginLeft: 4 }}>%</span>
        </div>
        <div className="uppercase-label" style={{ marginTop: 8 }}>scanning</div>
      </div>
    </div>
  )
}

// ── Striped progress bar ─────────────────────────────────────────────────────

function StripedProgress({ pct }: { pct: number }) {
  return (
    <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'var(--color-border-subtle)', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: `${pct * 100}%`,
        background: 'linear-gradient(90deg, var(--color-low), white)',
        borderRadius: 3,
        transition: 'width 90ms linear',
        boxShadow: '0 0 12px rgba(74,158,255,0.55)',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.18) 0 8px, transparent 8px 16px)',
          animation: 'stripes-move 600ms linear infinite',
          mixBlendMode: 'overlay',
          borderRadius: 3,
        }} />
      </div>
      {/* leading spark */}
      <div style={{
        position: 'absolute',
        left: `calc(${pct * 100}% - 1px)`,
        top: -3, bottom: -3, width: 2,
        background: 'white',
        boxShadow: '0 0 12px white, 0 0 24px rgba(74,158,255,0.6)',
        opacity: pct > 0 && pct < 1 ? 1 : 0,
        transition: 'left 90ms linear, opacity 200ms',
      }} />
    </div>
  )
}

// ── Step pills ────────────────────────────────────────────────────────────────

function StepPills({ pct }: { pct: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STEPS.length}, 1fr)`, gap: 8 }}>
      {STEPS.map((s, i) => {
        const prevUntil = i === 0 ? 0 : STEPS[i - 1].until
        const state = pct >= s.until ? 'done' : pct >= prevUntil ? 'active' : 'pending'
        return (
          <div key={s.label} style={{
            padding: '12px',
            border: `1px solid ${state === 'active' ? 'var(--color-low)' : state === 'done' ? 'rgba(48,209,88,0.33)' : 'var(--color-border-subtle)'}`,
            borderRadius: 8,
            background: state === 'active' ? 'rgba(74,158,255,0.05)' : state === 'done' ? 'rgba(48,209,88,0.04)' : 'transparent',
            transition: 'all 240ms',
            opacity: state === 'pending' ? 0.45 : 1,
            position: 'relative', overflow: 'hidden',
          }}>
            {state === 'active' && (
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: 'linear-gradient(90deg, transparent, rgba(74,158,255,0.12), transparent)',
                animation: 'shimmer 1.6s ease-in-out infinite',
              }} />
            )}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 11, fontFamily: 'monospace',
              color: state === 'done' ? 'var(--color-clean)' : state === 'active' ? 'var(--color-low)' : 'var(--color-text-secondary)',
              marginBottom: 6,
            }}>
              {state === 'done' ? (
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : state === 'active' ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: 'spin 1s linear infinite' }}>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20" strokeLinecap="round" />
                </svg>
              ) : (
                <span style={{ width: 8, height: 8, borderRadius: '50%', border: '1px solid currentColor', display: 'inline-block' }} />
              )}
              {String(i + 1).padStart(2, '0')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-primary)', lineHeight: 1.3 }}>{s.label}</div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4, fontFamily: 'monospace' }}>{s.detail}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── File ticker ───────────────────────────────────────────────────────────────

function FileTicker({ history, currentFile }: { history: string[]; currentFile: string | null }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [history.length])

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
        padding: '10px 14px',
        borderBottom: '1px solid var(--color-border-subtle)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'var(--color-bg-tertiary)',
      }}>
        <span className="uppercase-label">Files</span>
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {history.length} / {SCAN_FILES.length}
        </span>
      </div>
      <div ref={ref} className="scroll" style={{
        flex: 1, minHeight: 0,
        padding: '8px 0',
        fontFamily: 'monospace',
        fontSize: 12,
      }}>
        {history.map((path, i) => {
          const sev = FILE_SEVS[path] ?? 'clean'
          const color = SEV_COLOR[sev]
          return (
            <div key={path + i} className="fade-up" style={{
              padding: '4px 14px',
              display: 'flex', alignItems: 'center', gap: 10,
              color: sev === 'clean' ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
              borderLeft: sev !== 'clean' ? `2px solid ${color}` : '2px solid transparent',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{path}</span>
              <span style={{ fontSize: 9.5, color, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginLeft: 'auto', flexShrink: 0 }}>
                {sev === 'clean' ? 'ok' : sev}
              </span>
            </div>
          )
        })}
        {currentFile && (
          <div style={{ padding: '4px 14px', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--color-text-secondary)', opacity: 0.7 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20" strokeLinecap="round" />
            </svg>
            <span>{currentFile}</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-text-tertiary)' }}>scanning…</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Terminal log ──────────────────────────────────────────────────────────────

function TerminalLog({ pct }: { pct: number }) {
  const lines = LOG_SCRIPT.filter((l) => pct >= l.at)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [lines.length])

  return (
    <div ref={ref} className="scroll" style={{
      height: 140,
      padding: '14px 18px',
      fontFamily: 'monospace',
      fontSize: 12,
      background: '#050505',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 10,
      color: 'var(--color-text-secondary)',
      lineHeight: 1.7,
    }}>
      {lines.map((l, i) => (
        <div key={i} className="fade-up" style={{
          color: l.line.startsWith('$') ? 'var(--color-text-primary)'
            : l.sev === 'critical' ? 'var(--color-critical)'
            : l.sev === 'high' ? 'var(--color-high)'
            : l.sev === 'medium' ? 'var(--color-medium)'
            : l.sev === 'clean' ? 'var(--color-clean)'
            : 'var(--color-text-secondary)',
        }}>
          {l.line}
        </div>
      ))}
      <span style={{ color: 'var(--color-text-primary)', animation: 'blink 1s steps(2) infinite' }}>▍</span>
    </div>
  )
}

// ── Counter row ───────────────────────────────────────────────────────────────

function CounterRow({ pct, fileCount, issueCount }: { pct: number; fileCount: number; issueCount: number }) {
  const TOTAL_DUR_S = 60
  const stats = [
    { label: 'Files',   value: `${fileCount} / ${SCAN_FILES.length}`, color: 'var(--color-text-primary)' },
    { label: 'Lines',   value: Math.round(pct * 18432).toLocaleString(), color: 'var(--color-text-primary)' },
    { label: 'Issues',  value: String(issueCount), color: issueCount ? 'var(--color-critical)' : 'var(--color-text-primary)' },
    { label: 'Elapsed', value: `${(pct * TOTAL_DUR_S).toFixed(1)}s`, color: 'var(--color-text-primary)' },
  ]
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 10, overflow: 'hidden',
    }}>
      {stats.map((s, i) => (
        <div key={s.label} style={{
          padding: '14px 18px',
          borderRight: i < stats.length - 1 ? '1px solid var(--color-border-subtle)' : 'none',
          background: 'var(--color-bg-secondary)',
        }}>
          <div className="uppercase-label" style={{ marginBottom: 6 }}>{s.label}</div>
          <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 600, color: s.color, letterSpacing: '-0.02em', lineHeight: 1 }}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Animation driver — runs in-UI for visual effect; real poll drives redirect ─

const ANIM_DURATION_MS = 55_000

function buildFileSchedule() {
  const schedule: Array<{ path: string; at: number }> = []
  const findingPaths = Object.keys(FILE_SEVS)
  const cleanPaths = SCAN_FILES.filter((p) => !FILE_SEVS[p])
  const findingMoments = [0.10, 0.18, 0.28, 0.36, 0.45, 0.52, 0.60, 0.68, 0.76, 0.83, 0.90, 0.95]
  cleanPaths.forEach((p, i) => schedule.push({ path: p, at: 0.02 + (i / cleanPaths.length) * 0.94 }))
  findingPaths.forEach((p, i) => schedule.push({ path: p, at: findingMoments[i] ?? 0.5 }))
  return schedule.sort((a, b) => a.at - b.at)
}
const FILE_SCHEDULE = buildFileSchedule()

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ScanLoadingPage() {
  const router = useRouter()
  const params = useParams()
  const scanId = typeof params?.scanId === 'string' ? params.scanId : 'unknown'

  // animation state
  const [animPct, setAnimPct] = useState(0)
  const [scannedFiles, setScannedFiles] = useState<string[]>([])
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const lastIdxRef = useRef(-1)
  const animRafRef = useRef<number>(0)
  const animStartRef = useRef<number>(0)

  // real scan state
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanDone, setScanDone] = useState(false)

  // Run animation
  useEffect(() => {
    animStartRef.current = performance.now()
    const tick = (t: number) => {
      const p = Math.min(0.98, (t - animStartRef.current) / ANIM_DURATION_MS)
      setAnimPct(p)
      const newIdx = FILE_SCHEDULE.findIndex((f) => f.at > p)
      const upTo = newIdx === -1 ? FILE_SCHEDULE.length : newIdx
      if (upTo - 1 !== lastIdxRef.current) {
        lastIdxRef.current = upTo - 1
        setScannedFiles(FILE_SCHEDULE.slice(0, upTo).map((f) => f.path))
        setCurrentFile(FILE_SCHEDULE[upTo]?.path ?? null)
      }
      if (p < 0.98) animRafRef.current = requestAnimationFrame(tick)
    }
    animRafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRafRef.current)
  }, [])

  // Complete animation instantly when scan finishes
  useEffect(() => {
    if (scanDone) {
      cancelAnimationFrame(animRafRef.current)
      setAnimPct(1)
      setScannedFiles(FILE_SCHEDULE.map((f) => f.path))
      setCurrentFile(null)
      setTimeout(() => router.push(`/scan/${scanId}`), 400)
    }
  }, [scanDone, scanId, router])

  // Poll real scan status — uses lightweight endpoint (no COS fetch)
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/scan/${scanId}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as ScanStatus | { status: string }
      if (data.status === 'complete') { setScanDone(true); return }
      if (data.status === 'error') { setScanError((data as ScanStatus).error ?? 'Scan failed — please try again.') }
    } catch { /* swallow — keep polling */ }
  }, [scanId])

  useEffect(() => {
    poll()
    const interval = setInterval(poll, 2000)
    return () => clearInterval(interval)
  }, [poll])

  const issueCount = scannedFiles.filter((p) => FILE_SEVS[p]).length

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
        opacity: 0.35,
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
        padding: '14px 24px',
        borderBottom: '1px solid var(--color-border-subtle)',
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--color-text-primary)' }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M10 2L3 5v5c0 4.418 3.134 8.56 7 9 3.866-.44 7-4.582 7-9V5L10 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontFamily: 'Poppins, ui-sans-serif, sans-serif', fontWeight: 700, fontSize: 15 }}>VibeCheck</span>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          color: 'var(--color-text-secondary)', fontSize: 13,
          justifyContent: 'center', fontFamily: 'monospace',
        }}>
          <span style={{ color: 'var(--color-text-primary)' }}>{scanId}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="uppercase-label">ETA</span>
          <span style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--color-text-primary)' }}>
            {Math.max(0, ((1 - animPct) * (ANIM_DURATION_MS / 1000))).toFixed(0)}s
          </span>
          <a
            href="/"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', borderRadius: 6,
              border: '1px solid var(--color-border)',
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              fontSize: 12, textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            Cancel
          </a>
        </div>
      </header>

      {/* Main content */}
      <main style={{
        position: 'relative',
        padding: '20px 24px',
        display: 'grid',
        gridTemplateColumns: '1fr 320px 1fr',
        gap: 20,
        minHeight: 0,
        maxWidth: 1400,
        width: '100%',
        margin: '0 auto',
      }}>
        {/* Left: counters + file ticker */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
          <CounterRow pct={animPct} fileCount={scannedFiles.length} issueCount={issueCount} />
          <FileTicker history={scannedFiles} currentFile={currentFile} />
        </div>

        {/* Center: radar + status */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
          gap: 24, paddingTop: 8,
        }}>
          <RadarVisual pct={animPct} scannedFiles={scannedFiles} />
          <div style={{ textAlign: 'center', maxWidth: 300 }}>
            <div className="uppercase-label" style={{ marginBottom: 8 }}>Currently</div>
            <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text-primary)', minHeight: 20 }}>
              {currentFile ?? (animPct < 1 ? 'indexing…' : 'report ready')}
            </div>
          </div>
          {/* Score forming up */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            opacity: animPct > 0.85 ? 1 : 0,
            transform: animPct > 0.85 ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 600ms, transform 600ms',
          }}>
            <div className="uppercase-label">Composite score</div>
            <div style={{ fontFamily: 'monospace', fontSize: 26, fontWeight: 600, color: 'var(--color-high)', letterSpacing: '-0.04em' }}>
              {animPct > 0.95 ? 42 : Math.round(animPct * 50)}
              <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginLeft: 4 }}>/ 100</span>
            </div>
          </div>
        </div>

        {/* Right: step pills + (error or placeholder) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
          <StepPills pct={animPct} />

          {scanError && (
            <div style={{
              padding: 16, borderRadius: 8,
              border: '1px solid var(--color-critical)',
              background: 'rgba(255,59,48,0.08)',
            }} role="alert">
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-critical)', marginBottom: 8 }}>Scan Failed</p>
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12 }}>{scanError}</p>
              <a href="/" style={{
                display: 'inline-block', padding: '8px 14px', borderRadius: 6,
                background: 'var(--color-text-primary)', color: 'var(--color-bg-primary)',
                fontSize: 12, fontWeight: 600, textDecoration: 'none',
              }}>
                Try Another Repo
              </a>
            </div>
          )}
        </div>
      </main>

      {/* Footer: progress + terminal */}
      <footer style={{
        position: 'relative',
        padding: '14px 24px 20px',
        borderTop: '1px solid var(--color-border-subtle)',
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span className="uppercase-label" style={{ minWidth: 80 }}>Progress</span>
          <div style={{ flex: 1 }}>
            <StripedProgress pct={animPct} />
          </div>
          <span style={{ fontFamily: 'monospace', minWidth: 56, fontSize: 13, color: 'var(--color-text-primary)', textAlign: 'right' }}>
            {(animPct * 100).toFixed(1)}%
          </span>
        </div>
        <TerminalLog pct={animPct} />
      </footer>
    </div>
  )
}
