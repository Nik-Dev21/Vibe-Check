/**
 * lib/scanner/fast-pass.ts
 * Featherless fast-pass classifier — Phase 2 of the scan pipeline.
 * Classifies every repo file as HIGH / MEDIUM / LOW / CLEAN.
 * LOW + CLEAN files stop here (cost control — never sent to watsonx.ai).
 */

import { classifyFile } from '../featherless'
import type { RepoFile, FastPassResult } from '../types'

// Max concurrent Featherless requests (rate limit safety)
const CONCURRENCY = 10

/**
 * Run all files through the Featherless fast-pass classifier.
 * Files are processed in concurrent batches of CONCURRENCY.
 */
export async function runFastPass(files: RepoFile[]): Promise<FastPassResult[]> {
  const results: FastPassResult[] = []

  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY)

    const settled = await Promise.allSettled(
      batch.map((file) =>
        classifyFile(file.path, file.language, file.content)
      )
    )

    for (let j = 0; j < settled.length; j++) {
      const outcome = settled[j]
      if (outcome.status === 'fulfilled') {
        results.push(outcome.value)
      } else {
        // Featherless error on a specific file — default to LOW, never block scan
        console.warn(
          `[fast-pass] classifyFile failed for ${batch[j].path}: ${
            outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
          }`
        )
        results.push({
          filePath: batch[j].path,
          riskLevel: 'LOW',
          detectedTypes: [],
          confidence: 0,
        })
      }
    }
  }

  return results
}

/**
 * Filter fast-pass results to only HIGH and MEDIUM files.
 * Used by deep-scan to know which files need watsonx.ai analysis.
 */
export function getHighRiskFiles(
  files: RepoFile[],
  fastPassResults: FastPassResult[]
): RepoFile[] {
  const highRiskPaths = new Set(
    fastPassResults
      .filter((r) => r.riskLevel === 'HIGH' || r.riskLevel === 'MEDIUM')
      .map((r) => r.filePath)
  )
  return files.filter((f) => highRiskPaths.has(f.path))
}
