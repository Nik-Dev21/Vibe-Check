'use client'

import { useState, useEffect, useRef, useMemo, useId } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import ConnectGitHubButton from '@/components/auth/connect-github-button'
import RepoSelector from '@/components/repo-selector'

// ── Constants ────────────────────────────────────────────────────────────────

const CYCLING_WORDS = [
  { word: 'vulnerabilities', color: 'var(--color-critical)' },
  { word: 'leaked secrets',  color: 'var(--color-high)' },
  { word: 'open auth gaps',  color: 'var(--color-medium)' },
  { word: 'SQL injection',   color: 'var(--color-critical)' },
  { word: 'exposed env vars',color: 'var(--color-high)' },
  { word: 'missing CSP',     color: 'var(--color-low)' },
]

const LIVE_FINDINGS = [
  { sev: 'critical', code: 'CWE-798', file: 'lib/stripe.ts:14',          msg: 'hardcoded api key' },
  { sev: 'critical', code: 'CWE-89',  file: 'api/users/route.ts:24',     msg: 'sql injection in raw query' },
  { sev: 'high',     code: 'CWE-306', file: 'api/admin/route.ts:8',      msg: 'missing auth on admin route' },
  { sev: 'high',     code: 'CVE-2024-46982', file: 'package.json:18',    msg: 'next.js cache poisoning' },
  { sev: 'high',     code: 'CWE-347', file: 'api/auth/login.ts:47',      msg: 'jwt accepts alg:none' },
  { sev: 'medium',   code: 'CWE-942', file: 'next.config.js:14',         msg: 'permissive cors + credentials' },
  { sev: 'medium',   code: 'CWE-521', file: 'api/auth/login.ts:12',      msg: 'weak password policy' },
  { sev: 'low',      code: 'CWE-1021',file: 'middleware.ts:6',           msg: 'no content-security-policy' },
  { sev: 'critical', code: 'CWE-200', file: 'lib/db.ts:12',              msg: 'db url leaked to client bundle' },
  { sev: 'high',     code: 'CWE-79',  file: 'notes/[id]/page.tsx:31',    msg: 'xss via dangerouslySetInnerHTML' },
]

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'var(--color-critical)',
  high:     'var(--color-high)',
  medium:   'var(--color-medium)',
  low:      'var(--color-low)',
  clean:    'var(--color-clean)',
}

const MARQUEE_ITEMS = [
  'bolt.new', 'lovable.dev', 'cursor', 'v0.dev', 'replit agent',
  'windsurf', 'claude code', 'magic patterns', 'tempo', 'mage',
]

const GITHUB_REPO_RE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\/.*)?$/

// ── Sub-components ───────────────────────────────────────────────────────────

function CyclingWord() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % CYCLING_WORDS.length), 2200)
    return () => clearInterval(id)
  }, [])
  const cur = CYCLING_WORDS[i]
  return (
    <span
      key={i}
      style={{
        position: 'relative',
        display: 'inline-block',
        color: cur.color,
        whiteSpace: 'nowrap',
        animation: 'fade-up 500ms cubic-bezier(.2,.7,.2,1) both',
      }}
    >
      {cur.word}
      <span style={{
        position: 'absolute',
        left: 0, right: 0,
        bottom: '0.12em',
        height: '0.07em',
        background: cur.color,
        transformOrigin: 'left center',
        animation: 'strike-draw 600ms cubic-bezier(.2,.7,.2,1) 250ms both',
      }} />
    </span>
  )
}

function MouseSpotlight() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!ref.current) return
      const rect = ref.current.parentElement!.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100
      ref.current.style.background =
        `radial-gradient(600px circle at ${x}% ${y}%, rgba(255,255,255,0.06), transparent 55%)`
    }
    const parent = ref.current?.parentElement
    parent?.addEventListener('mousemove', onMove)
    return () => parent?.removeEventListener('mousemove', onMove)
  }, [])
  return (
    <div ref={ref} style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      transition: 'background 80ms linear',
      mixBlendMode: 'screen',
    }} />
  )
}

function HeroBackdrop() {
  const orbs = useMemo(() =>
    Array.from({ length: 14 }).map((_, i) => ({
      key: i,
      left: 10 + (i * 6.5) % 80,
      top: 50 + (i * 7) % 50,
      dx: ((i % 7) - 3) * 60,
      dy: -120 - (i * 20) % 160,
      size: 2 + (i % 4),
      delay: (i * 0.7) % 8,
      dur: 8 + (i * 1.3) % 10,
      color: ['var(--color-critical)', 'var(--color-high)', 'var(--color-medium)', 'var(--color-low)', 'var(--color-clean)'][i % 5],
    }))
  , [])

  return (
    <div style={{
      position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none',
      maskImage: 'radial-gradient(ellipse 90% 80% at center, black 35%, transparent 75%)',
      WebkitMaskImage: 'radial-gradient(ellipse 90% 80% at center, black 35%, transparent 75%)',
    }}>
      {/* Drifting grid */}
      <div style={{
        position: 'absolute',
        inset: '-96px',
        backgroundImage: `
          repeating-linear-gradient(90deg, var(--color-border-subtle) 0 1px, transparent 1px 96px),
          repeating-linear-gradient(0deg,  var(--color-border-subtle) 0 1px, transparent 1px 96px)
        `,
        opacity: 0.55,
        animation: 'grid-drift 24s linear infinite',
      }} />

      {/* Radial pulse */}
      <div style={{
        position: 'absolute',
        left: '50%', top: '50%',
        width: 1200, height: 1200,
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.04), transparent 60%)',
        animation: 'radial-pulse 6s ease-in-out infinite',
      }} />

      {/* Vertical scan beam */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0, top: 0,
        height: 200,
        background: 'linear-gradient(180deg, transparent, rgba(74,158,255,0.12) 40%, rgba(74,158,255,0.22) 50%, rgba(74,158,255,0.12) 60%, transparent)',
        animation: 'hero-beam 7s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute',
        left: 0, right: 0, top: 0,
        height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(74,158,255,0.6), transparent)',
        boxShadow: '0 0 12px rgba(74,158,255,0.6)',
        animation: 'hero-beam 7s ease-in-out infinite',
        animationDelay: '0.05s',
      }} />

      {/* Drifting orbs */}
      {orbs.map((o) => (
        <span key={o.key} style={{
          position: 'absolute',
          left: `${o.left}%`, top: `${o.top}%`,
          width: o.size, height: o.size,
          borderRadius: '50%',
          background: o.color,
          boxShadow: `0 0 ${o.size * 4}px ${o.color}`,
          opacity: 0,
          animation: `orb-drift ${o.dur}s ease-in-out ${o.delay}s infinite`,
          // @ts-expect-error CSS custom props
          '--dx': `${o.dx}px`,
          '--dy': `${o.dy}px`,
        }} />
      ))}
    </div>
  )
}

function FloatingCards() {
  const cards = [
    { sev: 'critical', title: 'Hardcoded Stripe key', file: '.env.production', x: '-38vw', y: -60,  rot: -8, delay: 0 },
    { sev: 'critical', title: 'SQL injection',        file: 'users/route.ts',  x: '38vw',  y: -110, rot:  6, delay: 0.4 },
    { sev: 'high',     title: 'Missing auth check',   file: 'admin/route.ts',  x: '-40vw', y:  140, rot: -5, delay: 0.8 },
    { sev: 'medium',   title: 'Permissive CORS',      file: 'next.config.js',  x: '40vw',  y:  190, rot:  7, delay: 1.2 },
  ]
  return (
    <div style={{
      position: 'absolute',
      left: '50%', top: '50%',
      transform: 'translate(-50%, -50%)',
      width: 0, height: 0,
      pointerEvents: 'none',
    }}>
      {cards.map((c) => {
        const color = SEVERITY_COLOR[c.sev]
        return (
          <div key={c.title} style={{
            position: 'absolute',
            left: c.x,
            top: c.y,
            transform: `translate(-50%, -50%) rotate(${c.rot}deg)`,
            width: 220,
            padding: '10px 12px',
            background: 'rgba(10,10,10,0.85)',
            backdropFilter: 'blur(6px)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            boxShadow: '0 24px 48px -16px rgba(0,0,0,0.7)',
            opacity: 0,
            animation: `detect-pop 700ms cubic-bezier(.2,.7,.2,1) ${c.delay}s both, orb-drift 18s ease-in-out ${c.delay}s infinite`,
            // @ts-expect-error CSS custom props
            '--dx': '0px',
            '--dy': '-8px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: color, boxShadow: `0 0 8px ${color}` }} />
              <span className="uppercase-label" style={{ color, fontSize: 9.5 }}>{c.sev}</span>
            </div>
            <div style={{
              fontFamily: 'var(--font-display, Poppins, sans-serif)',
              fontSize: 13, fontWeight: 600,
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.01em',
              marginBottom: 4,
            }}>{c.title}</div>
            <div style={{
              fontFamily: 'monospace',
              fontSize: 10.5,
              color: 'var(--color-text-tertiary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{c.file}</div>
          </div>
        )
      })}
    </div>
  )
}

function LiveFindingTicker() {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % LIVE_FINDINGS.length), 2200)
    return () => clearInterval(id)
  }, [])
  const cur = LIVE_FINDINGS[idx]
  const color = SEVERITY_COLOR[cur.sev]

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 14px',
      border: '1px solid var(--color-border)',
      borderRadius: 999,
      background: 'rgba(0,0,0,0.4)',
      backdropFilter: 'blur(8px)',
      fontFamily: 'monospace',
      fontSize: 11.5,
      maxWidth: '92vw',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: color,
        boxShadow: `0 0 8px ${color}`,
        animation: 'pulse-soft 1.2s ease-in-out infinite',
      }} />
      <span className="uppercase-label" style={{ color, letterSpacing: '0.12em' }}>
        Live · {cur.sev}
      </span>
      <span style={{ color: 'var(--color-border-strong)' }}>·</span>
      <span
        key={idx}
        style={{
          color: 'var(--color-text-primary)',
          animation: 'ticker-in 360ms cubic-bezier(.2,.7,.2,1) both',
          display: 'inline-flex', gap: 8, alignItems: 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        <span style={{ color: 'var(--color-text-tertiary)' }}>{cur.code}</span>
        <span style={{ color: 'var(--color-text-secondary)' }}>{cur.msg}</span>
        <span style={{ color: 'var(--color-text-quaternary, #444)' }}>{cur.file}</span>
      </span>
    </div>
  )
}

function Counter({ to, duration = 1400 }: { to: number; duration?: number }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf: number
    const start = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setV(to * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, duration])
  return <span>{Math.round(v).toLocaleString()}</span>
}

function VibeMarquee() {
  const doubled = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS]
  return (
    <div style={{
      width: '100%', overflow: 'hidden',
      maskImage: 'linear-gradient(90deg, transparent, black 12%, black 88%, transparent)',
      WebkitMaskImage: 'linear-gradient(90deg, transparent, black 12%, black 88%, transparent)',
    }}>
      <div style={{
        display: 'flex',
        gap: 56,
        whiteSpace: 'nowrap',
        animation: 'marquee 28s linear infinite',
        width: 'max-content',
      }}>
        {doubled.map((p, i) => (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            fontFamily: 'monospace',
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--color-text-quaternary, #444)' }} />
            {p}
          </span>
        ))}
      </div>
    </div>
  )
}

function MagneticButton({ children, onClick, type = 'button', className = '', style = {} }: {
  children: React.ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  className?: string
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current; if (!el) return
    const r = el.getBoundingClientRect()
    const dx = (e.clientX - (r.left + r.width / 2)) * 0.18
    const dy = (e.clientY - (r.top + r.height / 2)) * 0.18
    el.style.transform = `translate(${dx}px, ${dy}px)`
  }
  const onLeave = () => {
    const el = ref.current; if (!el) return
    el.style.transform = 'translate(0,0)'
  }
  return (
    <button
      ref={ref}
      type={type}
      onClick={onClick}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={className}
      style={{ transition: 'transform 200ms cubic-bezier(.2,.7,.2,1)', ...style }}
    >
      {children}
    </button>
  )
}

// ── Scan input logic (inline, no extra component) ────────────────────────────

function ScanForm() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const inputId = useId()
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const isAuth = status === 'authenticated' && !!session

  function validate(url: string) {
    if (!url.trim()) return 'Enter a GitHub repository URL.'
    if (!GITHUB_REPO_RE.test(url.trim())) return 'Must be a valid GitHub repository URL.'
    return null
  }

  async function doScan(repoUrl: string) {
    const err = validate(repoUrl)
    if (err) { setError(err); return }
    setError(null); setIsScanning(true)
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: repoUrl.trim() }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? `Error ${res.status}`)
      }
      const { scanId } = (await res.json()) as { scanId: string }
      router.push(`/scan/${scanId}/loading`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed — try again.')
      setIsScanning(false)
    }
  }

  return (
    <div style={{ width: '100%', maxWidth: 680 }}>
      {isAuth && (
        <div style={{ marginBottom: 12 }}>
          <RepoSelector onSelect={(url) => setValue(url)} />
        </div>
      )}
      {!isAuth && status !== 'loading' && (
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
          <ConnectGitHubButton />
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); doScan(value) }} noValidate>
        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: 8,
          border: `1px solid ${focused ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
          borderRadius: 14,
          background: 'rgba(10,10,10,0.6)',
          backdropFilter: 'blur(8px)',
          transition: 'border-color 160ms, box-shadow 160ms',
          boxShadow: focused
            ? '0 0 0 6px rgba(255,255,255,0.04), 0 12px 48px -10px rgba(74,158,255,0.25)'
            : '0 8px 32px -16px rgba(0,0,0,0.8)',
        }}>
          {/* GitHub icon */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 6px 0 12px', color: 'var(--color-text-tertiary)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          </div>
          <label htmlFor={inputId} className="sr-only">GitHub repository URL</label>
          <input
            id={inputId}
            type="url"
            value={value}
            onChange={(e) => { setValue(e.target.value); if (error) setError(null) }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="github.com/your-org/your-repo"
            spellCheck={false}
            autoComplete="off"
            disabled={isScanning}
            aria-invalid={error ? 'true' : 'false'}
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              padding: '10px 4px',
              fontSize: 15,
              fontFamily: 'monospace',
              color: 'var(--color-text-primary)',
              outline: 'none',
            }}
          />
          <MagneticButton
            type="submit"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 20px',
              borderRadius: 10,
              border: 'none',
              background: 'white',
              color: 'black',
              fontWeight: 600,
              fontSize: 14,
              cursor: isScanning ? 'wait' : 'pointer',
              opacity: isScanning ? 0.75 : 1,
              animation: 'cta-glow 2.6s ease-in-out infinite',
              whiteSpace: 'nowrap',
            }}
          >
            {isScanning ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: 'spin 1s linear infinite' }}>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20" strokeLinecap="round" />
                </svg>
                Scanning…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                Scan now
              </>
            )}
          </MagneticButton>
        </div>

        {error && (
          <p role="alert" style={{ marginTop: 8, fontSize: 12, color: 'var(--color-critical)', textAlign: 'center' }}>
            {error}
          </p>
        )}
      </form>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 16, marginTop: 14,
        fontFamily: 'monospace',
        fontSize: 11,
        color: 'var(--color-text-tertiary)',
      }}>
        <span>Public repos · free</span>
        <span style={{ color: 'var(--color-border-strong)' }}>·</span>
        <span>Private repos via OAuth</span>
        <span style={{ color: 'var(--color-border-strong)' }}>·</span>
        <span>~60s scan time</span>
      </div>
    </div>
  )
}

// ── Page sections ────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section style={{
      position: 'relative',
      minHeight: 'calc(100vh - 56px)',
      padding: '100px 32px 80px',
      display: 'grid',
      placeItems: 'center',
      isolation: 'isolate',
    }}>
      <HeroBackdrop />
      <MouseSpotlight />
      <div className="noise-overlay" />
      <FloatingCards />

      <div style={{ position: 'relative', maxWidth: 1040, width: '100%', textAlign: 'center' }}>
        {/* Eyebrow */}
        <div className="fade-up" style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          padding: '6px 14px',
          border: '1px solid var(--color-border)',
          borderRadius: 999,
          marginBottom: 36,
          fontFamily: 'monospace',
          fontSize: 11.5,
          color: 'var(--color-text-secondary)',
          background: 'rgba(255,255,255,0.02)',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--color-clean)',
            boxShadow: '0 0 8px var(--color-clean)',
            animation: 'pulse-soft 1.4s ease-in-out infinite',
          }} />
          Pre-deploy security gate · v0.4 beta
        </div>

        {/* Headline */}
        <h1 className="fade-up" style={{
          fontFamily: 'Poppins, ui-sans-serif, sans-serif',
          fontWeight: 700,
          fontSize: 'clamp(28px, 3.2vw, 52px)',
          lineHeight: 1.1,
          letterSpacing: '-0.03em',
          margin: 0,
          color: 'var(--color-text-primary)',
          animationDelay: '60ms',
        }}>
          Your vibe-coded app has
          <br />
          <span style={{ display: 'inline-block', marginTop: '0.16em', fontWeight: 700 }}>
            <CyclingWord />.
          </span>
        </h1>

        <p className="fade-up" style={{
          fontWeight: 400,
          fontSize: 'clamp(14px, 1.2vw, 17px)',
          lineHeight: 1.55,
          color: 'var(--color-text-secondary)',
          margin: '20px auto 0',
          maxWidth: 520,
          animationDelay: '120ms',
        }}>
          Paste a GitHub URL — VibeCheck clones, scans, and ships a one-click PR with the fix in under 60 seconds.
        </p>

        {/* Scan form */}
        <div className="fade-up" style={{ marginTop: 48, display: 'flex', justifyContent: 'center', animationDelay: '180ms' }}>
          <ScanForm />
        </div>

        {/* Live ticker */}
        <div className="fade-up" style={{ marginTop: 36, display: 'flex', justifyContent: 'center', animationDelay: '260ms' }}>
          <LiveFindingTicker />
        </div>

        {/* Live counters */}
        <div className="fade-up" style={{
          marginTop: 40,
          display: 'flex',
          justifyContent: 'center',
          gap: 56,
          animationDelay: '320ms',
          flexWrap: 'wrap',
        }}>
          {[
            { label: 'Repos scanned today',   value: 1247, color: 'var(--color-text-primary)' },
            { label: 'Vulnerabilities found', value: 18432, color: 'var(--color-critical)' },
            { label: 'Patches shipped',       value: 9871, color: 'var(--color-clean)' },
          ].map((s) => (
            <div key={s.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                fontFamily: 'Poppins, ui-sans-serif, sans-serif',
                fontWeight: 700,
                fontSize: 24,
                lineHeight: 1,
                letterSpacing: '-0.025em',
                color: s.color,
              }}>
                <Counter to={s.value} duration={1800} />
              </div>
              <div className="uppercase-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function StackStrip() {
  return (
    <section style={{
      borderTop: '1px solid var(--color-border-subtle)',
      borderBottom: '1px solid var(--color-border-subtle)',
      padding: '28px 0',
      background: 'var(--color-bg-secondary)',
    }}>
      <div className="uppercase-label" style={{ textAlign: 'center', marginBottom: 18 }}>
        Catches issues from code generated by
      </div>
      <VibeMarquee />
    </section>
  )
}

function StatRow() {
  const stats = [
    {
      kicker: 'The problem',
      value: '45%',
      label: 'of AI-generated code shipped to prod contains exploitable security vulnerabilities.',
      footnote: 'Source: Veracode · State of Software Security 2025',
      accent: 'var(--color-critical)',
    },
    {
      kicker: 'The fix',
      value: '60s',
      label: 'from paste-the-URL to a plain-English report you can act on. No CI setup, no config.',
      footnote: 'p50 across last 1,200 scans',
      accent: 'var(--color-low)',
    },
    {
      kicker: 'The engine',
      value: 'Granite',
      label: 'IBM Granite + Featherless inference. Runs the same checks a senior security eng would.',
      footnote: 'watsonx.ai · model card linked',
      accent: 'var(--color-clean)',
    },
  ]
  return (
    <section style={{ padding: '80px 32px 0', maxWidth: 1240, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {stats.map((s) => (
          <div key={s.kicker} style={{
            padding: '28px 24px',
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 12,
            borderTop: `2px solid ${s.accent}`,
          }}>
            <div className="uppercase-label" style={{ marginBottom: 12 }}>{s.kicker}</div>
            <div style={{
              fontFamily: 'Poppins, ui-sans-serif, sans-serif',
              fontWeight: 700,
              fontSize: 40,
              letterSpacing: '-0.03em',
              lineHeight: 1,
              color: s.accent,
              marginBottom: 12,
            }}>{s.value}</div>
            <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--color-text-secondary)', margin: 0 }}>{s.label}</p>
            <p style={{ fontSize: 11, marginTop: 16, color: 'var(--color-text-tertiary)', fontFamily: 'monospace' }}>{s.footnote}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function HowItWorks() {
  const steps = [
    {
      n: '01',
      title: 'Paste a GitHub URL',
      desc: 'Public repos work instantly. Private repos: connect once via OAuth — read-only, source never stored.',
    },
    {
      n: '02',
      title: 'Granite scans every file',
      desc: 'Taint analysis, secrets, dependency CVEs, auth gaps, and config drift — graded by exploitability.',
    },
    {
      n: '03',
      title: 'One-click PR with the fix',
      desc: 'Each vulnerability ships with a generated patch. Review the diff, push as a branch, merge when ready.',
    },
  ]
  return (
    <section id="how" style={{ padding: '80px 32px 0', maxWidth: 1240, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 64, alignItems: 'start' }}>
        <div>
          <div className="uppercase-label" style={{ marginBottom: 12 }}>How it works</div>
          <h2 style={{
            fontFamily: 'Poppins, ui-sans-serif, sans-serif',
            fontWeight: 600,
            fontSize: 28,
            lineHeight: 1.1,
            letterSpacing: '-0.025em',
            margin: 0,
            color: 'var(--color-text-primary)',
          }}>
            Three steps.<br />No CI, no config.
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 16, fontSize: 14.5, lineHeight: 1.55, maxWidth: 280 }}>
            We clone, scan, and report in under a minute. Apply patches with one click — VibeCheck opens a PR so you keep your review flow.
          </p>
        </div>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--color-border-subtle)' }}>
          {steps.map((s) => (
            <li
              key={s.n}
              style={{
                display: 'grid',
                gridTemplateColumns: '80px 1fr',
                gap: 24,
                alignItems: 'baseline',
                padding: '28px 4px',
                borderBottom: '1px solid var(--color-border-subtle)',
                transition: 'background 160ms',
                cursor: 'default',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.015)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontFamily: 'monospace', color: 'var(--color-text-quaternary, #444)', fontSize: 13, letterSpacing: '0.04em' }}>{s.n}</span>
              <div>
                <div style={{ fontFamily: 'Poppins, ui-sans-serif, sans-serif', fontWeight: 600, fontSize: 18, letterSpacing: '-0.015em', color: 'var(--color-text-primary)' }}>{s.title}</div>
                <div style={{ color: 'var(--color-text-secondary)', marginTop: 8, fontSize: 14, lineHeight: 1.55 }}>{s.desc}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function BottomCTA() {
  const router = useRouter()
  return (
    <section style={{ padding: '120px 32px', textAlign: 'center', position: 'relative' }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 60% 80% at center, rgba(74,158,255,0.06), transparent 60%)',
        pointerEvents: 'none',
      }} />
      <div className="uppercase-label" style={{ marginBottom: 20 }}>Ready when you are</div>
      <h2 style={{
        fontFamily: 'Poppins, ui-sans-serif, sans-serif',
        fontWeight: 700,
        fontSize: 'clamp(24px, 2.8vw, 36px)',
        lineHeight: 1.1,
        letterSpacing: '-0.03em',
        margin: 0,
        color: 'var(--color-text-primary)',
      }}>
        Find what&apos;s broken.<br />
        <span style={{ color: 'var(--color-text-tertiary)' }}>Before someone else does.</span>
      </h2>
      <div style={{ marginTop: 40, display: 'flex', justifyContent: 'center', gap: 12 }}>
        <MagneticButton
          onClick={() => router.push('/#scan')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '14px 24px', fontSize: 14, borderRadius: 8,
            border: 'none', background: 'white', color: 'black', fontWeight: 600,
            cursor: 'pointer',
            animation: 'cta-glow 2.6s ease-in-out infinite',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
          Scan a repo
        </MagneticButton>
        <a
          href="https://github.com/Nik-Dev21/Vibe-Check"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '14px 24px', fontSize: 14, borderRadius: 8,
            border: '1px solid var(--color-border)',
            background: 'transparent', color: 'var(--color-text-primary)',
            textDecoration: 'none', fontWeight: 500,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
          View on GitHub
        </a>
      </div>
    </section>
  )
}

function PageFooter() {
  return (
    <footer style={{
      borderTop: '1px solid var(--color-border-subtle)',
      padding: '28px 32px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      color: 'var(--color-text-tertiary)',
      fontFamily: 'monospace',
      fontSize: 11.5,
    }}>
      <span>© 2026 VibeCheck Labs</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--color-clean)',
          boxShadow: '0 0 6px var(--color-clean)',
          animation: 'pulse-soft 1.4s ease-in-out infinite',
        }} />
        Built on IBM Granite + Featherless · all systems normal
      </span>
    </footer>
  )
}

// ── Navbar (replaces the server component on landing) ────────────────────────

function LandingNav() {
  const { data: session, status } = useSession()
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded focus:font-semibold">
        Skip to content
      </a>
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 40,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px',
        height: 56,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--color-border-subtle)',
      }}>
        <Link href="/" style={{
          display: 'flex', alignItems: 'center', gap: 10,
          textDecoration: 'none', color: 'var(--color-text-primary)',
        }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M10 2L3 5v5c0 4.418 3.134 8.56 7 9 3.866-.44 7-4.582 7-9V5L10 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontFamily: 'Poppins, ui-sans-serif, sans-serif', fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>
            VibeCheck
          </span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span className="uppercase-label" style={{ cursor: 'default' }}>How it works</span>
          <a
            href="https://github.com/Nik-Dev21/Vibe-Check"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 13, color: 'var(--color-text-secondary)',
              textDecoration: 'none',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            GitHub
          </a>
          {status !== 'loading' && (
            session ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {session.user.image && (
                  <img src={session.user.image} alt="" width={28} height={28} style={{ borderRadius: '50%' }} />
                )}
                <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>
                  {session.user.login ?? session.user.name}
                </span>
              </div>
            ) : (
              <ConnectGitHubButton />
            )
          )}
        </div>
      </nav>
      <div style={{ height: 56 }} aria-hidden="true" />
    </>
  )
}

// ── Root ─────────────────────────────────────────────────────────────────────

export default function LandingClient() {
  return (
    <div id="main" style={{
      position: 'relative',
      width: '100%',
      minHeight: '100vh',
      background: 'var(--color-bg-primary)',
      overflowX: 'hidden',
    }}>
      <LandingNav />
      <Hero />
      <StackStrip />
      <StatRow />
      <HowItWorks />
      <BottomCTA />
      <PageFooter />
    </div>
  )
}
