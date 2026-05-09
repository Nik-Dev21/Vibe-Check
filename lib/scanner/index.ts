/**
 * lib/scanner/index.ts
 * Scan pipeline orchestrator — runs all 5 phases in order.
 *
 * Phase 1: GitHub Fetcher    — fetch repo files
 * Phase 2: Fast-Pass         — Featherless classifier on all files
 * Phase 3: Deep Scan         — watsonx.ai on HIGH/MEDIUM files only
 * Phase 4: Context Layer     — NLU README enrichment
 * Phase 5: Report Builder    — assemble ScanReport + calculate score
 */

import { v4 as uuidv4 } from 'uuid'
import { getRepoFiles } from '../github'
import { runFastPass } from './fast-pass'
import { runDeepScan } from './deep-scan'
import { enrichContext, escalateSeverities } from './context-layer'
import { buildReport } from './report-builder'
import { updateScanStatus } from '../ibm/cloudant'
import type { ScanReport, ScanStatus } from '../types'

/**
 * Run the full VibeCheck scan pipeline for a given GitHub repo URL.
 * Updates Cloudant with ScanStatus at each phase boundary.
 * Returns the assembled ScanReport on success.
 */
export async function runScanPipeline(
  repoUrl: string,
  scanId: string
): Promise<ScanReport> {
  const startedAt = Date.now()

  // Helper to update scan status in Cloudant (non-fatal if Cloudant is down)
  async function setStatus(
    phase: ScanStatus['phase'],
    progress: number
  ): Promise<void> {
    try {
      await updateScanStatus({
        scanId,
        status: 'scanning',
        phase,
        progress,
      })
    } catch (err) {
      console.warn(`[scanner] Could not update scan status: ${
        err instanceof Error ? err.message : String(err)
      }`)
    }
  }

  // ── Phase 1: Fetch repo files ───────────────────────────────────────────────
  await setStatus('fetching', 5)
  const files = await getRepoFiles(repoUrl)

  if (files.length === 0) {
    throw new Error(`No scannable files found in ${repoUrl}`)
  }

  // Infer repo name from URL
  const repoName = repoUrl.split('/').filter(Boolean).slice(-1)[0] ?? repoUrl

  // ── Phase 2: Featherless fast-pass ─────────────────────────────────────────
  await setStatus('classifying', 20)
  const fastPassResults = await runFastPass(files)

  // ── Phase 3: watsonx.ai deep scan ─────────────────────────────────────────
  await setStatus('deep-scan', 45)
  const rawVulnerabilities = await runDeepScan(files, fastPassResults)

  // ── Phase 4: NLU context enrichment ────────────────────────────────────────
  await setStatus('context', 70)
  const contextRisk = await enrichContext(files)

  // Escalate severities based on app context (e.g. MEDIUM → HIGH for SENSITIVE apps)
  const vulnerabilities = escalateSeverities(rawVulnerabilities, contextRisk)

  // ── Phase 5: Assemble report ────────────────────────────────────────────────
  await setStatus('building', 90)
  const report = buildReport({
    scanId,
    repoUrl,
    repoName,
    startedAt,
    filesScanned: files.length,
    vulnerabilities,
    fastPassResults,
    contextRisk,
  })

  return report
}

/**
 * Generate a new unique scan ID.
 */
export function generateScanId(): string {
  return `scan-${uuidv4()}`
}
