/**
 * lib/scanner/fast-pass.ts
 * Featherless fast-pass classifier — Phase 2 of the scan pipeline.
 * Classifies every repo file as HIGH / MEDIUM / LOW / CLEAN.
 * LOW + CLEAN files stop here (cost control — never sent to watsonx.ai).
 */

import { classifyFile, MAX_FILE_CHARS } from '../featherless'
import type { RepoFile, FastPassResult } from '../types'

// 1 request at a time: model costs 2 units/request, plan limit = 4 units.
// Sending 2 concurrent = 4 units used, but any retry or overlap tips over — use 1.
const CONCURRENCY = 1

/** No delay needed — CONCURRENCY=1 means requests are truly sequential */
const BATCH_DELAY_MS = 0

/**
 * File extensions that are never meaningful for security scanning.
 * Avoids wasting Featherless quota on lock files, images, fonts, etc.
 */
const SKIP_EXTENSIONS = new Set([
  // Dependency lock files (often huge, no security signal)
  '.lock', '.sum',
  // Binary / media
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp4', '.mp3', '.wav', '.pdf',
  '.zip', '.tar', '.gz', '.7z',
  // Generated / minified
  '.min.js', '.min.css', '.map',
])

const SKIP_FILENAMES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'bun.lockb',
  'Gemfile.lock',
  'Cargo.lock',
  'composer.lock',
  'poetry.lock',
  'go.sum',
  'Pipfile.lock',
])

function shouldSkipFile(file: RepoFile): boolean {
  const name = file.path.split('/').pop() ?? file.path
  if (SKIP_FILENAMES.has(name)) return true
  const ext = name.includes('.') ? '.' + name.split('.').pop()!.toLowerCase() : ''
  if (SKIP_EXTENSIONS.has(ext)) return true
  // Skip files larger than Featherless context window
  if (file.content.length > MAX_FILE_CHARS) {
    console.warn(`[fast-pass] Skipping ${file.path} — ${file.content.length} chars exceeds context limit`)
    return true
  }
  return false
}

/**
 * Run all files through the Featherless fast-pass classifier.
 * Files are processed in concurrent batches of CONCURRENCY.
 */
export async function runFastPass(files: RepoFile[]): Promise<FastPassResult[]> {
  const results: FastPassResult[] = []

  // Pre-filter — never send lock files, binaries, or oversized files
  const scannable = files.filter((f) => !shouldSkipFile(f))
  const skipped = files.length - scannable.length
  if (skipped > 0) {
    console.log(`[fast-pass] Skipping ${skipped} non-scannable files, scanning ${scannable.length}`)
  }

  for (let i = 0; i < scannable.length; i += CONCURRENCY) {
    const batch = scannable.slice(i, i + CONCURRENCY)

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

    // Breathing room between batches
    if (i + CONCURRENCY < scannable.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS))
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
