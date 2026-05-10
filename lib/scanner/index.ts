/**
 * lib/scanner/index.ts
 * Scan pipeline orchestrator — two-phase architecture:
 *
 * Phase 1 (hot path, blocking):
 *   GitHub fetch → prioritize files → Featherless classify+deep-scan all files
 *   NLU on README runs in parallel. Partial report assembled and stored.
 *   User sees results after this phase (~25s for 20 files).
 *
 * Phase 2 (background, non-blocking via waitUntil):
 *   Top 5 HIGH-confidence files sent to watsonx.ai at CONCURRENCY=2.
 *   Each completion appends findings to Cloudant. SSE stream picks them up live.
 *   Final status flips to 'complete' when all enrichment finishes.
 */

import { v4 as uuidv4 } from 'uuid'
import { getRepoFiles } from '../github'
import { prioritizeFiles } from './file-prioritizer'
import { runFastPassAndDeepScan } from './fast-pass'
import { enrichContext, escalateSeverities } from './context-layer'
import { buildReport } from './report-builder'
import { deepScanFile as watsonxDeepScan } from '../ibm/watsonx'
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

// ── Internal helpers ──────────────────────────────────────────────────────────

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

// ── Main scan (Featherless only, no watsonx in hot path) ─────────────────────

/**
 * Run the fast VibeCheck scan pipeline (Featherless only).
 * Returns a partial ScanReport and the top HIGH files for background enrichment.
 * onFileComplete fires after each file finishes so SSE can stream findings live.
 */
export async function runScanPipeline(
  repoUrl: string,
  scanId: string,
  githubToken?: string,
  onFileComplete?: OnFileComplete
): Promise<{ report: ScanReport; topHighFiles: TopHighFile[]; repoFiles: Array<{ path: string; content: string }> }> {
  const startedAt = Date.now()

  // ── Phase 1: Fetch + prioritize ────────────────────────────────────────────
  await setStatus(scanId, repoUrl, 'fetching', 5)
  const rawFiles = await getRepoFiles(repoUrl, githubToken)

  if (rawFiles.length === 0) {
    throw new Error(`No scannable files found in ${repoUrl}`)
  }

  const files = prioritizeFiles(rawFiles)
  const repoName = repoUrl.split('/').filter(Boolean).slice(-1)[0] ?? repoUrl

  await setStatus(scanId, repoUrl, 'classifying', 15, {
    repoName,
    totalFiles: files.length,
    scannedFiles: [],
    currentFile: files[0]?.path ?? null,
  })

  // ── Phase 2+3: Featherless fast-pass+deep-scan + NLU in parallel ──────────
  // NLU starts immediately — we race it with a 10s timeout so it never blocks.
  const nluPromise = enrichContext(rawFiles).catch((err) => {
    console.warn(`[scanner] NLU failed, using defaults: ${err instanceof Error ? err.message : String(err)}`)
    return {
      isPublicFacing: false,
      hasAuth: false,
      hasPayments: false,
      dataClassification: 'INTERNAL' as const,
    }
  })

  const liveScannedFiles: Array<{ path: string; riskLevel: FastPassResult['riskLevel'] }> = []
  const liveFindings: import('../types').Vulnerability[] = []
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

      const nextFile = files[liveScannedFiles.length]?.path ?? null
      void setStatus(scanId, repoUrl, 'deep-scan', 20 + Math.round(event.progress * 60), {
        repoName,
        totalFiles: files.length,
        scannedFiles: [...liveScannedFiles],
        currentFile: nextFile,
        issuesFound,
        partialFindings: [...liveFindings],
      })
    }
  )

  // ── Phase 3: NLU result (race with 10s timeout) ───────────────────────────
  await setStatus(scanId, repoUrl, 'context', 82)
  const nluTimeout = new Promise<typeof nluPromise extends Promise<infer T> ? T : never>(
    (resolve) => setTimeout(() => resolve({
      isPublicFacing: false,
      hasAuth: false,
      hasPayments: false,
      dataClassification: 'INTERNAL' as const,
    }), 10_000)
  )
  const contextRisk = await Promise.race([nluPromise, nluTimeout])

  const vulnerabilities = escalateSeverities(rawVulnerabilities, contextRisk)

  // ── Phase 4: Assemble partial report ─────────────────────────────────────
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

  // Extract top 5 HIGH files by confidence for background watsonx enrichment
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

// ── Background watsonx enrichment ────────────────────────────────────────────

const ENRICH_CONCURRENCY = 2

/**
 * Run watsonx.ai deep-scan on top HIGH files in the background.
 * Called via waitUntil after the partial report is already shown to the user.
 * Appends findings to Cloudant incrementally — SSE stream picks them up live.
 */
export async function enrichHighFiles(
  scanId: string,
  repoUrl: string,
  topHighFiles: TopHighFile[],
  onEnrichComplete?: (filePath: string, findings: Vulnerability[]) => void
): Promise<void> {
  if (topHighFiles.length === 0) {
    await updateScanStatus({ scanId, status: 'complete', phase: 'storing', progress: 100, repoUrl })
    return
  }

  // Mark which files are being enriched
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

  // Process in batches of ENRICH_CONCURRENCY
  for (let i = 0; i < topHighFiles.length; i += ENRICH_CONCURRENCY) {
    const batch = topHighFiles.slice(i, i + ENRICH_CONCURRENCY)
    await Promise.allSettled(
      batch.map(async ({ filePath, content }) => {
        try {
          const rawFindings = await watsonxDeepScan(filePath, content)
          const findings: Vulnerability[] = rawFindings.map((v) => ({
            ...v,
            id: `vuln-${uuidv4()}`,
            detectedBy: 'watsonx' as const,
          }))
          await appendEnrichedFindings(scanId, filePath, findings)
          onEnrichComplete?.(filePath, findings)
          console.log(`[enrich] watsonx found ${findings.length} finding(s) in ${filePath}`)
        } catch (err) {
          console.warn(`[enrich] watsonx failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
          await appendEnrichedFindings(scanId, filePath, []).catch(() => { /* best-effort */ })
        }
      })
    )
  }

  // Flip to complete
  try {
    await updateScanStatus({ scanId, status: 'complete', phase: 'storing', progress: 100, repoUrl })
  } catch (err) {
    console.warn(`[enrich] Final status update failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Generate a new unique scan ID.
 */
export function generateScanId(): string {
  return `scan-${uuidv4()}`
}
