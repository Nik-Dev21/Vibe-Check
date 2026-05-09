/**
 * lib/scanner/report-builder.ts
 * Assembles the final ScanReport from all pipeline phase outputs.
 * Calculates security score (0–100, higher = more secure).
 */

import type { ScanReport, Vulnerability, FastPassResult } from '../types'

interface BuildReportParams {
  scanId: string
  repoUrl: string
  repoName: string
  startedAt: number                        // Date.now() at scan start
  filesScanned: number
  vulnerabilities: Vulnerability[]
  fastPassResults: FastPassResult[]
  contextRisk: ScanReport['contextRisk']
  reportUrl?: string
}

/**
 * Calculate a 0–100 security score from the vulnerability list.
 * Higher score = more secure.
 *
 * Deduction table:
 *   CRITICAL: −25 each (cap at 75)
 *   HIGH:     −15 each (cap at 45)
 *   MEDIUM:   −5  each (cap at 20)
 *   LOW:      −1  each (cap at 5)
 */
function calculateSecurityScore(vulnerabilities: Vulnerability[]): number {
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 }
  for (const v of vulnerabilities) {
    counts[v.severity] = (counts[v.severity] ?? 0) + 1
  }

  const deductions =
    Math.min(counts.CRITICAL * 25, 75) +
    Math.min(counts.HIGH * 15, 45) +
    Math.min(counts.MEDIUM * 5, 20) +
    Math.min(counts.LOW * 1, 5)

  return Math.max(0, Math.min(100, 100 - deductions))
}

/**
 * Count vulnerabilities by severity for the summary block.
 */
function buildSummary(vulnerabilities: Vulnerability[]): ScanReport['summary'] {
  return {
    critical: vulnerabilities.filter((v) => v.severity === 'CRITICAL').length,
    high: vulnerabilities.filter((v) => v.severity === 'HIGH').length,
    medium: vulnerabilities.filter((v) => v.severity === 'MEDIUM').length,
    low: vulnerabilities.filter((v) => v.severity === 'LOW').length,
  }
}

/**
 * Sort vulnerabilities: CRITICAL first, then HIGH, MEDIUM, LOW, INFO.
 */
function sortBySeverity(vulnerabilities: Vulnerability[]): Vulnerability[] {
  const order: Record<string, number> = {
    CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4,
  }
  return [...vulnerabilities].sort(
    (a, b) => (order[a.severity] ?? 99) - (order[b.severity] ?? 99)
  )
}

/**
 * Assemble the final ScanReport from all pipeline phase outputs.
 */
export function buildReport(params: BuildReportParams): ScanReport {
  const {
    scanId,
    repoUrl,
    repoName,
    startedAt,
    filesScanned,
    vulnerabilities,
    contextRisk,
    reportUrl,
  } = params

  const sortedVulnerabilities = sortBySeverity(vulnerabilities)
  const securityScore = calculateSecurityScore(sortedVulnerabilities)
  const summary = buildSummary(sortedVulnerabilities)
  const durationMs = Date.now() - startedAt

  return {
    scanId,
    repoUrl,
    repoName,
    scannedAt: new Date(startedAt).toISOString(),
    durationMs,
    securityScore,
    filesScanned,
    vulnerabilities: sortedVulnerabilities,
    summary,
    contextRisk,
    reportUrl,
  }
}
