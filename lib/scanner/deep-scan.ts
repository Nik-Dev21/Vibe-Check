/**
 * lib/scanner/deep-scan.ts
 * watsonx.ai Granite deep-scan — Phase 3 of the scan pipeline.
 * Only runs on HIGH + MEDIUM files from the fast-pass.
 * Returns a deduplicated list of Vulnerability objects.
 */

import { v4 as uuidv4 } from 'uuid'
import { deepScanFile } from '../ibm/watsonx'
import type { RepoFile, FastPassResult, Vulnerability } from '../types'

// Max concurrent watsonx.ai requests (more expensive — keep low)
const CONCURRENCY = 5

/**
 * Run watsonx.ai deep analysis on HIGH and MEDIUM risk files.
 * Files classified LOW or CLEAN by fast-pass are skipped entirely.
 */
export async function runDeepScan(
  files: RepoFile[],
  fastPassResults: FastPassResult[]
): Promise<Vulnerability[]> {
  // Build a set of paths that need deep analysis
  const highRiskPaths = new Set(
    fastPassResults
      .filter((r) => r.riskLevel === 'HIGH' || r.riskLevel === 'MEDIUM')
      .map((r) => r.filePath)
  )

  const filesToScan = files.filter((f) => highRiskPaths.has(f.path))

  if (filesToScan.length === 0) return []

  const allVulnerabilities: Vulnerability[] = []

  for (let i = 0; i < filesToScan.length; i += CONCURRENCY) {
    const batch = filesToScan.slice(i, i + CONCURRENCY)

    const settled = await Promise.allSettled(
      batch.map((file) => deepScanFile(file.path, file.content))
    )

    for (let j = 0; j < settled.length; j++) {
      const outcome = settled[j]
      if (outcome.status === 'fulfilled') {
        // Assign proper UUIDs — watsonx returns positional IDs
        const vulns = outcome.value.map((v) => ({
          ...v,
          id: `vuln-${uuidv4()}`,
        }))
        allVulnerabilities.push(...vulns)
      } else {
        console.warn(
          `[deep-scan] deepScanFile failed for ${batch[j].path}: ${
            outcome.reason instanceof Error
              ? outcome.reason.message
              : String(outcome.reason)
          }`
        )
        // Don't block the scan — just skip this file's deep analysis
      }
    }
  }

  return deduplicateVulnerabilities(allVulnerabilities)
}

/**
 * Remove near-duplicate findings — same file + same line number + same category.
 * Keeps the first occurrence (watsonx tends to repeat itself on long files).
 */
function deduplicateVulnerabilities(vulns: Vulnerability[]): Vulnerability[] {
  const seen = new Set<string>()
  return vulns.filter((v) => {
    const key = `${v.filePath}:${v.lineNumber ?? 'noLine'}:${v.category}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
