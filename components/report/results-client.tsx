'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { ScanReport, Vulnerability } from '@/lib/types'
import FileTreePanel from '@/components/report/file-tree'
import VulnerabilityCard from '@/components/report/vulnerability-card'
import BulkPatchButton from '@/components/report/bulk-fix-button'

// ── Types ────────────────────────────────────────────────────────────────────

type Filter = 'all' | 'critical' | 'high' | 'medium' | 'low'

export interface ResultsClientProps {
  report: ScanReport
  scanId?: string
  isPartial?: boolean
}

// ── SSE event types ───────────────────────────────────────────────────────────

type SSEEvent =
  | { type: 'file_complete'; filePath: string; riskLevel: string; findings: Vulnerability[] }
  | { type: 'phase_update'; phase: string; progress: number }
  | { type: 'partial_complete'; report: ScanReport; enriching: boolean }
  | { type: 'enrich_update'; filePath: string; additionalFindings: Vulnerability[] }
  | { type: 'scan_complete'; report: ScanReport }
  | { type: 'error'; message: string }

function deduplicateVulns(vulns: Vulnerability[]): Vulnerability[] {
  const seen = new Set<string>()
  return vulns.filter((v) => {
    const key = `${v.filePath}:${v.lineNumber ?? 'x'}:${v.category}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const SEV_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']
function sortBySeverity(vulns: Vulnerability[]): Vulnerability[] {
  return [...vulns].sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity))
}

// ── Severity helpers ──────────────────────────────────────────────────────────

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--color-critical)',
  high:     'var(--color-high)',
  medium:   'var(--color-medium)',
  low:      'var(--color-low)',
  clean:    'var(--color-clean)',
}

function scoreColor(s: number) {
  if (s >= 90) return 'var(--color-clean)'
  if (s >= 70) return 'var(--color-low)'
  if (s >= 40) return 'var(--color-medium)'
  return 'var(--color-critical)'
}

function scoreLabel(s: number) {
  if (s >= 90) return 'Excellent'
  if (s >= 70) return 'Good'
  if (s >= 40) return 'At Risk'
  return 'Critical'
}

// ── Score ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 48, stroke = 5
  const size = 110
  const cx = size / 2, cy = size / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = scoreColor(score)
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-border)" strokeWidth={stroke} />
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.6s ease-out' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontFamily: 'Poppins, sans-serif', fontSize: 22, fontWeight: 700, color, lineHeight: 1, letterSpacing: '-0.03em' }}>
          {score}
        </span>
      </div>
    </div>
  )
}

// ── Summary bars ──────────────────────────────────────────────────────────────

function SummaryBars({
  summary, totalIssues, filter, onFilter,
}: {
  summary: ScanReport['summary']
  totalIssues: number
  filter: Filter
  onFilter: (f: Filter) => void
}) {
  const tracks: Array<{ sev: Filter; count: number }> = [
    { sev: 'critical', count: summary.critical },
    { sev: 'high',     count: summary.high },
    { sev: 'medium',   count: summary.medium },
    { sev: 'low',      count: summary.low },
  ]
  const max = Math.max(...tracks.map(t => t.count), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
        <span className="uppercase-label">Issues by severity</span>
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {totalIssues} total
        </span>
      </div>
      {tracks.map((t) => {
        const color = SEV_COLOR[t.sev]
        const isActive = filter === t.sev
        return (
          <button
            key={t.sev}
            type="button"
            onClick={() => onFilter(isActive ? 'all' : t.sev)}
            style={{
              display: 'grid', gridTemplateColumns: '68px 1fr 28px',
              alignItems: 'center', gap: 10,
              padding: '4px 8px', marginInline: -8,
              background: isActive ? 'var(--color-bg-tertiary)' : 'transparent',
              border: 'none', borderRadius: 6,
              color: 'inherit', cursor: 'pointer', textAlign: 'left',
              transition: 'background 120ms',
            }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
          >
            <span className="uppercase-label" style={{ color, fontSize: 10 }}>{t.sev}</span>
            <div style={{ position: 'relative', height: 5, background: 'var(--color-border-subtle)', borderRadius: 3 }}>
              <div style={{
                position: 'absolute', inset: 0,
                width: `${(t.count / max) * 100}%`,
                background: color, borderRadius: 3,
                boxShadow: t.count > 0 ? `0 0 8px ${color}55` : 'none',
                transition: 'width 600ms cubic-bezier(.2,.7,.2,1)',
              }} />
            </div>
            <span style={{ fontFamily: 'monospace', fontSize: 12, color, textAlign: 'right' }}>{t.count}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Scan meta ─────────────────────────────────────────────────────────────────

function ScanMeta({ report }: { report: ScanReport }) {
  const items = [
    { k: 'Files',    v: String(report.filesScanned) },
    { k: 'Duration', v: `${(report.durationMs / 1000).toFixed(1)}s` },
    { k: 'Data',     v: report.contextRisk.dataClassification },
    { k: 'Auth',     v: report.contextRisk.hasAuth ? 'yes' : 'no' },
    { k: 'Payments', v: report.contextRisk.hasPayments ? 'yes' : 'no' },
    { k: 'Model',    v: 'Featherless + watsonx' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px 20px' }}>
      {items.map((item) => (
        <div key={item.k} style={{
          display: 'flex', alignItems: 'baseline', gap: 8,
          paddingBlock: 4, borderBottom: '1px solid var(--color-border-subtle)',
        }}>
          <span className="uppercase-label" style={{ minWidth: 52 }}>{item.k}</span>
          <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: 'var(--color-text-primary)', flex: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.v}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Filter chips ──────────────────────────────────────────────────────────────

function FilterChip({ label, count, sev, active, onClick }: {
  label: string; count: number; sev?: string; active: boolean; onClick: () => void
}) {
  const color = sev ? SEV_COLOR[sev] : undefined
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '5px 12px',
        border: `1px solid ${active ? 'var(--color-border-strong)' : 'var(--color-border-subtle)'}`,
        borderRadius: 999,
        background: active ? 'var(--color-bg-tertiary)' : 'transparent',
        color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        fontSize: 12.5, cursor: 'pointer',
        transition: 'border-color 160ms, background 160ms',
      }}
    >
      {color && <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />}
      {label}
      <span style={{ fontFamily: 'monospace', fontSize: 11, color: color && active ? color : 'var(--color-text-tertiary)' }}>
        {count}
      </span>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ResultsClient({ report: initialReport, scanId, isPartial }: ResultsClientProps) {
  const [report, setReport] = useState<ScanReport>(initialReport)
  const [vulns, setVulns] = useState<Vulnerability[]>(initialReport.vulnerabilities)
  const [isEnriching, setIsEnriching] = useState(isPartial ?? false)
  const [filter, setFilter] = useState<Filter>('all')
  const [expandedId, setExpandedId] = useState<string | null>(
    initialReport.vulnerabilities[0]?.id ?? null
  )
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)

  // SSE: connect if scan is still partial/enriching
  useEffect(() => {
    if (!scanId || !isPartial) return

    const es = new EventSource(`/api/scan/${scanId}/stream`)
    esRef.current = es

    es.onmessage = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data as string) as SSEEvent
        switch (event.type) {
          case 'file_complete':
            if (event.findings.length > 0) {
              setVulns((prev) => sortBySeverity(deduplicateVulns([...prev, ...event.findings])))
            }
            break
          case 'partial_complete':
            setReport(event.report)
            setVulns(sortBySeverity(deduplicateVulns(event.report.vulnerabilities)))
            setIsEnriching(event.enriching)
            break
          case 'enrich_update':
            setVulns((prev) => sortBySeverity(deduplicateVulns([...prev, ...event.additionalFindings])))
            break
          case 'scan_complete':
            setReport(event.report)
            setVulns(sortBySeverity(deduplicateVulns(event.report.vulnerabilities)))
            setIsEnriching(false)
            es.close()
            break
          case 'error':
            setIsEnriching(false)
            es.close()
            break
        }
      } catch { /* malformed event — ignore */ }
    }

    es.onerror = () => {
      // SSE connection dropped — stop enriching banner, results already shown
      setIsEnriching(false)
      es.close()
    }

    return () => { es.close() }
  }, [scanId, isPartial])

  // Keep summary in sync with live vulns
  const liveSummary = useMemo(() => ({
    critical: vulns.filter((v) => v.severity === 'CRITICAL').length,
    high:     vulns.filter((v) => v.severity === 'HIGH').length,
    medium:   vulns.filter((v) => v.severity === 'MEDIUM').length,
    low:      vulns.filter((v) => v.severity === 'LOW').length,
  }), [vulns])

  const totalIssues = liveSummary.critical + liveSummary.high + liveSummary.medium + liveSummary.low

  const filteredVulns = useMemo(() => {
    let filtered = vulns
    if (activeFile) filtered = filtered.filter(v => v.filePath === activeFile)
    if (filter === 'all') return filtered
    return filtered.filter(v => v.severity.toLowerCase() === filter)
  }, [filter, activeFile, vulns])

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id)
  }

  const repoShort = report.repoUrl.replace('https://github.com/', '')

  return (
    <div style={{
      flex: 1, minHeight: 0,
      display: 'grid',
      gridTemplateRows: 'auto auto auto 1fr',
      overflow: 'hidden',
    }}>

      {/* ── Top bar ── */}
      <header style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center',
        gap: 24,
        padding: '10px 20px',
        borderBottom: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-secondary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, borderRadius: 6,
            border: '1px solid var(--color-border)',
            background: 'transparent', color: 'var(--color-text-secondary)',
            textDecoration: 'none',
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-primary)' }}>
            <Image src="/vibecheck_logo.png" alt="" width={22} height={22} style={{ filter: 'brightness(0) invert(1)', objectFit: 'contain' }} />
            <span style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 14 }}>VibeCheck</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }}>
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
          <a
            href={report.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontFamily: 'monospace', color: 'var(--color-text-primary)', textDecoration: 'none', fontSize: 13 }}
          >
            {repoShort}
          </a>
          {activeFile && (
            <>
              <span style={{ color: 'var(--color-border-strong)' }}>/</span>
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text-tertiary)' }}>{activeFile}</span>
              <button
                type="button"
                onClick={() => setActiveFile(null)}
                style={{ fontSize: 11, color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }}
              >
                ✕ clear
              </button>
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            {new Date(report.scannedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
          <BulkPatchButton vulnerabilities={vulns} repoUrl={report.repoUrl} />
          <Link
            href="/"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 6,
              border: '1px solid var(--color-border)',
              background: 'transparent', color: 'var(--color-text-secondary)',
              fontSize: 12, textDecoration: 'none',
            }}
          >
            ↺ New scan
          </Link>
        </div>
      </header>

      {/* ── Score + summary strip ── */}
      <section style={{
        display: 'grid',
        gridTemplateColumns: '300px 1fr',
        borderBottom: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-primary)',
      }}>
        {/* Score */}
        <div style={{
          padding: '18px 24px',
          display: 'flex', alignItems: 'center', gap: 20,
          borderRight: '1px solid var(--color-border-subtle)',
        }}>
          <ScoreRing score={report.securityScore} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div className="uppercase-label">Security score</div>
            <div style={{
              fontFamily: 'Poppins, sans-serif', fontSize: 20, fontWeight: 600,
              letterSpacing: '-0.02em', color: scoreColor(report.securityScore),
            }}>
              {scoreLabel(report.securityScore)}
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
              {report.securityScore}/100 composite
            </div>
          </div>
        </div>

        {/* Summary bars + scan meta */}
        <div style={{
          padding: '18px 24px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 32,
          alignItems: 'center',
        }}>
          <SummaryBars
            summary={liveSummary}
            totalIssues={totalIssues}
            filter={filter}
            onFilter={setFilter}
          />
          <ScanMeta report={report} />
        </div>
      </section>

      {/* ── Enrichment banner ── */}
      {isEnriching && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '7px 20px',
          background: 'color-mix(in srgb, var(--color-low) 8%, var(--color-bg-secondary))',
          borderBottom: '1px solid color-mix(in srgb, var(--color-low) 20%, transparent)',
          flexShrink: 0,
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true"
            style={{ animation: 'spin 1s linear infinite', flexShrink: 0, color: 'var(--color-low)' }}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"
              strokeDasharray="60" strokeDashoffset="20" strokeLinecap="round" />
          </svg>
          <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: 'var(--color-low)' }}>
            Enriching with IBM watsonx.ai — additional findings may appear
          </span>
        </div>
      )}

      {/* ── Body: file tree + vuln list ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '280px 1fr',
        minHeight: 0,
        overflow: 'hidden',
      }}>
        {/* File tree */}
        <FileTreePanel
          vulnerabilities={vulns}
          filesScanned={report.filesScanned}
          activeFile={activeFile}
          onSelect={setActiveFile}
        />

        {/* Vuln list */}
        <main style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* Filter bar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 20px',
            borderBottom: '1px solid var(--color-border-subtle)',
            gap: 16, flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <FilterChip label="All" count={totalIssues} active={filter === 'all'} onClick={() => setFilter('all')} />
              <FilterChip label="Critical" count={liveSummary.critical} sev="critical" active={filter === 'critical'} onClick={() => setFilter(filter === 'critical' ? 'all' : 'critical')} />
              <FilterChip label="High" count={liveSummary.high} sev="high" active={filter === 'high'} onClick={() => setFilter(filter === 'high' ? 'all' : 'high')} />
              <FilterChip label="Medium" count={liveSummary.medium} sev="medium" active={filter === 'medium'} onClick={() => setFilter(filter === 'medium' ? 'all' : 'medium')} />
              <FilterChip label="Low" count={liveSummary.low} sev="low" active={filter === 'low'} onClick={() => setFilter(filter === 'low' ? 'all' : 'low')} />
            </div>
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
              {filteredVulns.length} shown
            </span>
          </div>

          {/* Cards */}
          <div className="scroll" style={{ flex: 1, minHeight: 0, padding: '14px 20px 40px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredVulns.map((v, idx) => (
                <VulnerabilityCard
                  key={v.id}
                  vulnerability={v}
                  index={idx}
                  expanded={expandedId === v.id}
                  onToggle={() => toggleExpand(v.id)}
                  repoUrl={report.repoUrl}
                />
              ))}
              {filteredVulns.length === 0 && (
                <div style={{
                  padding: '40px 20px', textAlign: 'center',
                  color: 'var(--color-text-tertiary)',
                  border: '1px dashed var(--color-border)',
                  borderRadius: 10,
                }}>
                  <div style={{ color: 'var(--color-clean)', fontSize: 20, marginBottom: 8 }}>✓</div>
                  <div>Nothing at this severity. Nice.</div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
