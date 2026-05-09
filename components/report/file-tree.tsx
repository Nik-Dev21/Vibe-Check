/**
 * components/report/file-tree.tsx
 * List of scanned files with per-file highest-severity dot.
 * Server Component.
 */

import type { Vulnerability, Severity } from '@/lib/types'

interface FileTreeProps {
  vulnerabilities: Vulnerability[]
  filesScanned: number
}

const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']

const SEVERITY_COLOR: Record<Severity, string> = {
  CRITICAL: 'var(--color-critical)',
  HIGH:     'var(--color-high)',
  MEDIUM:   'var(--color-medium)',
  LOW:      'var(--color-low)',
  INFO:     'var(--color-text-tertiary)',
}

function highestSeverity(severities: Severity[]): Severity {
  for (const s of SEVERITY_ORDER) {
    if (severities.includes(s)) return s
  }
  return 'INFO'
}

interface FileRow {
  path: string
  highest: Severity
  count: number
}

function buildFileRows(vulnerabilities: Vulnerability[]): FileRow[] {
  const fileMap = new Map<string, Severity[]>()

  for (const v of vulnerabilities) {
    const existing = fileMap.get(v.filePath)
    if (existing) {
      existing.push(v.severity)
    } else {
      fileMap.set(v.filePath, [v.severity])
    }
  }

  return Array.from(fileMap.entries())
    .map(([path, severities]) => ({
      path,
      highest: highestSeverity(severities),
      count: severities.length,
    }))
    .sort((a, b) => {
      const ai = SEVERITY_ORDER.indexOf(a.highest)
      const bi = SEVERITY_ORDER.indexOf(b.highest)
      return ai - bi
    })
}

export default function FileTree({ vulnerabilities, filesScanned }: FileTreeProps) {
  const rows = buildFileRows(vulnerabilities)
  const flaggedCount = rows.length
  const cleanCount = filesScanned - flaggedCount

  return (
    <section
      className="rounded-lg border"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        borderColor: '#222222',
      }}
      aria-label="Scanned files"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: '#222222' }}
      >
        <h2
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Scanned Files
        </h2>
        <span
          className="text-xs font-mono tabular-nums"
          style={{ color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}
        >
          {filesScanned} total
        </span>
      </div>

      {/* File list */}
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-sm" style={{ color: 'var(--color-clean)' }}>
            No files flagged — your repo is clean.
          </p>
        </div>
      ) : (
        <ul
          className="overflow-y-auto"
          style={{ maxHeight: '28rem' }}
          aria-label="Files with vulnerabilities"
        >
          {rows.map((row) => (
            <li
              key={row.path}
              className="flex min-w-0 items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
              style={{ borderColor: '#1a1a1a' }}
            >
              {/* Severity dot */}
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: SEVERITY_COLOR[row.highest] }}
                aria-label={`${row.highest} severity`}
              />

              {/* File path */}
              <span
                className="min-w-0 flex-1 truncate font-mono text-xs"
                style={{ color: 'var(--color-text-primary)' }}
                title={row.path}
              >
                {row.path}
              </span>

              {/* Vuln count */}
              <span
                className="shrink-0 font-mono text-xs tabular-nums"
                style={{ color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}
              >
                {row.count}
              </span>
            </li>
          ))}

          {/* Clean files summary row */}
          {cleanCount > 0 && (
            <li
              className="flex min-w-0 items-center gap-3 px-4 py-2.5"
              style={{ borderTop: '1px solid #1a1a1a' }}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: 'var(--color-clean)' }}
                aria-label="Clean"
              />
              <span
                className="min-w-0 flex-1 truncate text-xs"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {cleanCount} clean file{cleanCount !== 1 ? 's' : ''}
              </span>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}
