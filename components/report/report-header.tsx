/**
 * components/report/report-header.tsx
 * Security score, repo info, scan metadata, severity summary bar.
 * Server Component.
 */

import type { ScanReport } from '@/lib/types'

interface ReportHeaderProps {
  report: ScanReport
}

function scoreColor(score: number): string {
  if (score >= 90) return 'var(--color-clean)'   // 90–100: green
  if (score >= 70) return 'var(--color-low)'      // 70–89: blue
  if (score >= 40) return 'var(--color-medium)'   // 40–69: amber
  return 'var(--color-critical)'                  // 0–39: red
}

/** SVG circular progress ring around the score number */
function ScoreRing({ score, color }: { score: number; color: string }) {
  const radius = 58
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  return (
    <svg
      width="140"
      height="140"
      viewBox="0 0 140 140"
      className="absolute inset-0"
      aria-hidden="true"
    >
      {/* Background ring */}
      <circle
        cx="70"
        cy="70"
        r={radius}
        fill="none"
        stroke="#222222"
        strokeWidth="6"
      />
      {/* Progress ring */}
      <circle
        cx="70"
        cy="70"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{
          transform: 'rotate(-90deg)',
          transformOrigin: '50% 50%',
          transition: 'stroke-dashoffset 0.6s ease-out',
        }}
      />
    </svg>
  )
}

interface SeverityPillProps {
  label: string
  count: number
  colorVar: string
}

function SeverityPill({ label, count, colorVar }: SeverityPillProps) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-mono"
      style={{
        color: colorVar,
        borderColor: colorVar,
        backgroundColor: `color-mix(in srgb, ${colorVar} 10%, transparent)`,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span className="font-bold">{count}</span>
      <span className="opacity-80">{label}</span>
    </span>
  )
}

export default function ReportHeader({ report }: ReportHeaderProps) {
  const {
    securityScore,
    repoName,
    repoUrl,
    scannedAt,
    durationMs,
    filesScanned,
    summary,
    contextRisk,
  } = report

  const scanDate = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(scannedAt))

  const durationSec = (durationMs / 1000).toFixed(1)

  const dataClassColors: Record<string, string> = {
    CRITICAL: 'var(--color-critical)',
    SENSITIVE: 'var(--color-high)',
    INTERNAL: 'var(--color-medium)',
    PUBLIC: 'var(--color-low)',
  }
  const dataClassColor = dataClassColors[contextRisk.dataClassification] ?? 'var(--color-text-tertiary)'

  return (
    <header
      className="rounded-lg border p-6"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        borderColor: '#222222',
      }}
    >
      {/* Score + repo row */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        {/* Score block with circular ring */}
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <div
            className="relative flex h-[140px] w-[140px] items-center justify-center"
            aria-label={`Security score: ${securityScore} out of 100`}
          >
            <ScoreRing score={securityScore} color={scoreColor(securityScore)} />
            <span
              className="text-5xl font-bold tabular-nums"
              style={{
                color: scoreColor(securityScore),
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {securityScore}
            </span>
          </div>
          <span
            className="text-xs uppercase tracking-widest"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            Security Score
          </span>
          {/* Issue context below the score */}
          {summary.critical > 0 && (
            <span
              className="text-xs font-semibold"
              style={{ color: 'var(--color-critical)' }}
            >
              {summary.critical} critical issue{summary.critical !== 1 ? 's' : ''} found
            </span>
          )}
          {summary.critical === 0 && summary.high > 0 && (
            <span
              className="text-xs font-semibold"
              style={{ color: 'var(--color-high)' }}
            >
              {summary.high} high severity issue{summary.high !== 1 ? 's' : ''} found
            </span>
          )}
          {summary.critical === 0 && summary.high === 0 && (summary.medium > 0 || summary.low > 0) && (
            <span
              className="text-xs font-semibold"
              style={{ color: 'var(--color-medium)' }}
            >
              {summary.medium + summary.low} issue{summary.medium + summary.low !== 1 ? 's' : ''} found
            </span>
          )}
          {summary.critical === 0 && summary.high === 0 && summary.medium === 0 && summary.low === 0 && (
            <span
              className="text-xs font-semibold"
              style={{ color: 'var(--color-clean)' }}
            >
              No issues found
            </span>
          )}
        </div>

        {/* Repo + meta block */}
        <div className="flex flex-col gap-3 sm:text-right">
          <div>
            <p
              className="text-2xl font-semibold leading-tight break-words"
              style={{ color: 'var(--color-text-primary)' }}
              translate="no"
            >
              {repoName}
            </p>
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {repoUrl}
            </a>
          </div>

          {/* Scan metadata */}
          <dl className="flex flex-col gap-0.5 sm:items-end">
            <div className="flex items-center gap-2 sm:justify-end">
              <dt className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Scanned</dt>
              <dd className="text-xs font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                <time dateTime={scannedAt}>{scanDate}</time>
              </dd>
            </div>
            <div className="flex items-center gap-2 sm:justify-end">
              <dt className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Duration</dt>
              <dd
                className="text-xs font-mono tabular-nums"
                style={{ color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}
              >
                {durationSec}s
              </dd>
            </div>
            <div className="flex items-center gap-2 sm:justify-end">
              <dt className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Files scanned</dt>
              <dd
                className="text-xs font-mono tabular-nums"
                style={{ color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}
              >
                {filesScanned}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Severity summary bar */}
      <div className="mt-6 flex flex-wrap gap-2" role="list" aria-label="Vulnerability summary">
        <div role="listitem">
          <SeverityPill label="CRITICAL" count={summary.critical} colorVar="var(--color-critical)" />
        </div>
        <div role="listitem">
          <SeverityPill label="HIGH" count={summary.high} colorVar="var(--color-high)" />
        </div>
        <div role="listitem">
          <SeverityPill label="MEDIUM" count={summary.medium} colorVar="var(--color-medium)" />
        </div>
        <div role="listitem">
          <SeverityPill label="LOW" count={summary.low} colorVar="var(--color-low)" />
        </div>
      </div>

      {/* Context risk badges */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span
          className="rounded border px-2 py-0.5 text-xs font-mono"
          style={{ borderColor: dataClassColor, color: dataClassColor }}
        >
          {contextRisk.dataClassification}
        </span>
        {contextRisk.isPublicFacing && (
          <span
            className="rounded border px-2 py-0.5 text-xs font-mono"
            style={{ borderColor: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)' }}
          >
            Public-Facing
          </span>
        )}
        {contextRisk.hasAuth && (
          <span
            className="rounded border px-2 py-0.5 text-xs font-mono"
            style={{ borderColor: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)' }}
          >
            Auth
          </span>
        )}
        {contextRisk.hasPayments && (
          <span
            className="rounded border px-2 py-0.5 text-xs font-mono"
            style={{ borderColor: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)' }}
          >
            Payments
          </span>
        )}
      </div>
    </header>
  )
}
