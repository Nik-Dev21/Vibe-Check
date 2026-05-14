/**
 * lib/scanner/index.ts
 * Scan pipeline orchestrator — single-phase Claude scan.
 *
 * Pipeline (target wall-clock ~10-15s for 20 files):
 *   GitHub fetch → prioritize → Claude scan all files in parallel (CONCURRENCY=8)
 *                → sync README keyword scan → assemble report
 *
 * Optional second-opinion enrichment (background, non-blocking):
 *   Top HIGH files → Featherless deep-scan, merged into Cloudant as they arrive.
 */

import { v4 as uuidv4 } from 'uuid'
import { getRepoFiles } from '../github'
import { prioritizeFiles } from './file-prioritizer'
import { runFastPassAndDeepScan } from './fast-pass'
import { enrichContext, escalateSeverities } from './context-layer'
import { buildReport } from './report-builder'
import { deepScanFile as featherlessDeepScan } from '../featherless'
import { updateScanStatus, appendEnrichedFindings } from '../ibm/cloudant'
import type { ScanReport, ScanStatus, Vulnerability, FastPassResult } from '../types'

export type OnFileComplete = (event: {
  filePath: string
  riskLevel: FastPassResult['riskLevel']
  findings: Vulnerability[]
}) => void

export interface TopHighFile {
  filePath: string
  content: string
  confidence: number
}

async function setStatus(
  scanId: string,
  repoUrl: string,
  phase: ScanStatus['phase'],
  progress: number,
  extra?: Record<string, unknown>
): Promise<void> {
  try {
    await updateScanStatus({
      scanId,
      status: 'scanning',
      phase,
      progress,
      repoUrl,
      ...(extra as Partial<ScanStatus>),
    })
  } catch (err) {
    console.warn(`[scanner] Status update failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Run the Claude-based scan pipeline. Returns the full report and the top
 * HIGH-risk files (the caller may optionally feed these to enrichWithFeatherless
 * for a free second-opinion via Featherless in the background).
 */
export async function runScanPipeline(
  repoUrl: string,
  scanId: string,
  githubToken?: string,
  onFileComplete?: OnFileComplete
): Promise<{ report: ScanReport; topHighFiles: TopHighFile[]; repoFiles: Array<{ path: string; content: string }> }> {
  const startedAt = Date.now()

  await setStatus(scanId, repoUrl, 'fetching', 5)
  const rawFiles = await getRepoFiles(repoUrl, githubToken)
  if (rawFiles.length === 0) {
    throw new Error(`No scannable files found in ${repoUrl}`)
  }

  const files = prioritizeFiles(rawFiles)
  const repoName = repoUrl.split('/').filter(Boolean).slice(-1)[0] ?? repoUrl

  // Status updates are throttled — we only flush every Nth file to avoid
  // hammering Cloudant (each putDocument adds 200-500ms latency).
  const STATUS_THROTTLE_EVERY = 3

  await setStatus(scanId, repoUrl, 'classifying', 10, {
    repoName,
    totalFiles: files.length,
    scannedFiles: [],
    currentFile: files[0]?.path ?? null,
  })

  const liveScannedFiles: Array<{ path: string; riskLevel: FastPassResult['riskLevel'] }> = []
  const liveFindings: Vulnerability[] = []
  let issuesFound = 0

  const { fastPassResults, rawVulnerabilities } = await runFastPassAndDeepScan(
    files,
    (event) => {
      liveScannedFiles.push({ path: event.filePath, riskLevel: event.riskLevel })
      liveFindings.push(...event.findings)
      issuesFound += event.findings.length

      onFileComplete?.({
        filePath: event.filePath,
        riskLevel: event.riskLevel,
        findings: event.findings,
      })

      const isLast = event.completed === event.total
      if (isLast || event.completed % STATUS_THROTTLE_EVERY === 0) {
        const nextFile = files[liveScannedFiles.length]?.path ?? null
        void setStatus(scanId, repoUrl, 'deep-scan', 15 + Math.round(event.progress * 70), {
          repoName,
          totalFiles: files.length,
          scannedFiles: [...liveScannedFiles],
          currentFile: nextFile,
          issuesFound,
          partialFindings: [...liveFindings],
        })
      }
    }
  )

  // README keyword scan is synchronous and instant
  const contextRisk = enrichContext(rawFiles)
  const vulnerabilities = escalateSeverities(rawVulnerabilities, contextRisk)

  await setStatus(scanId, repoUrl, 'building', 90)
  const report = buildReport({
    scanId,
    repoUrl,
    repoName,
    startedAt,
    filesScanned: rawFiles.length,
    vulnerabilities,
    fastPassResults,
    contextRisk,
  })

  const topHighFiles: TopHighFile[] = fastPassResults
    .filter((r) => r.riskLevel === 'HIGH')
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5)
    .map((r) => {
      const fileContent = files.find((f) => f.path === r.filePath)?.content ?? ''
      return { filePath: r.filePath, content: fileContent, confidence: r.confidence }
    })

  return {
    report,
    topHighFiles,
    repoFiles: files.map((f) => ({ path: f.path, content: f.content })),
  }
}

// ── Featherless second-opinion (background, non-blocking) ────────────────────

// Featherless free tier — 2 concurrent requests is the safe ceiling
const FEATHERLESS_CONCURRENCY = 2

/**
 * Optional second-opinion pass: feed top HIGH files to Featherless and append
 * any additional findings to Cloudant. Runs in background via waitUntil — the
 * SSE stream picks up new findings as they land.
 *
 * Falls through silently if Featherless is unavailable.
 */
export async function enrichWithFeatherless(
  scanId: string,
  repoUrl: string,
  topHighFiles: TopHighFile[],
  onEnrichComplete?: (filePath: string, findings: Vulnerability[]) => void
): Promise<void> {
  if (topHighFiles.length === 0) {
    await updateScanStatus({ scanId, status: 'complete', phase: 'storing', progress: 100, repoUrl })
    return
  }

  try {
    await updateScanStatus({
      scanId,
      status: 'scanning',
      phase: 'deep-scan',
      progress: 92,
      repoUrl,
      enrichingFiles: topHighFiles.map((f) => f.filePath),
    } as Parameters<typeof updateScanStatus>[0])
  } catch { /* non-fatal */ }

  for (let i = 0; i < topHighFiles.length; i += FEATHERLESS_CONCURRENCY) {
    const batch = topHighFiles.slice(i, i + FEATHERLESS_CONCURRENCY)
    await Promise.allSettled(
      batch.map(async ({ filePath, content }) => {
        try {
          const rawFindings = await featherlessDeepScan(filePath, content)
          const findings: Vulnerability[] = rawFindings.map((v) => ({
            ...v,
            id: `vuln-${uuidv4()}`,
            detectedBy: 'featherless' as const,
          }))
          await appendEnrichedFindings(scanId, filePath, findings)
          onEnrichComplete?.(filePath, findings)
          console.log(`[enrich] Featherless added ${findings.length} finding(s) for ${filePath}`)
        } catch (err) {
          console.warn(`[enrich] Featherless failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
          await appendEnrichedFindings(scanId, filePath, []).catch(() => { /* best-effort */ })
        }
      })
    )
  }

  try {
    await updateScanStatus({ scanId, status: 'complete', phase: 'storing', progress: 100, repoUrl })
  } catch (err) {
    console.warn(`[enrich] Final status update failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export function generateScanId(): string {
  return `scan-${uuidv4()}`
}
