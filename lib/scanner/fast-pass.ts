/**
 * lib/scanner/fast-pass.ts
 * Single-pass scanner — one Claude Haiku call per file does both classification
 * and deep-scan. Runs at CLAUDE_CONCURRENCY parallel for fast wall-clock.
 *
 * Featherless is no longer in the hot path. (It is optionally used as a
 * second-opinion enrichment via lib/scanner/index.enrichWithFeatherless.)
 */

import { scanFile as claudeScanFile, CLAUDE_MAX_FILE_CHARS } from '../claude'
import { v4 as uuidv4 } from 'uuid'
import type { RepoFile, FastPassResult, Vulnerability, VulnCategory, Severity } from '../types'

// Anthropic tier-1 = 50 RPM, 50k ITPM. With MAX_FILES_TO_SCAN=30 and a worker
// pool size of 12, a typical scan completes in 3 batches × ~3s ≈ 10s wall-clock.
const CLAUDE_CONCURRENCY = 12

const SKIP_EXTENSIONS = new Set([
  '.lock', '.sum',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp4', '.mp3', '.wav', '.pdf',
  '.zip', '.tar', '.gz', '.7z',
  '.min.js', '.min.css', '.map',
])

const SKIP_FILENAMES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'bun.lock', 'bun.lockb', 'Gemfile.lock', 'Cargo.lock',
  'composer.lock', 'poetry.lock', 'go.sum', 'Pipfile.lock',
])

function shouldSkipFile(file: RepoFile): boolean {
  const name = file.path.split('/').pop() ?? file.path
  if (SKIP_FILENAMES.has(name)) return true
  const ext = name.includes('.') ? '.' + name.split('.').pop()!.toLowerCase() : ''
  if (SKIP_EXTENSIONS.has(ext)) return true
  if (file.content.length > CLAUDE_MAX_FILE_CHARS) {
    console.warn(`[scan] Skipping ${file.path} — ${file.content.length} chars exceeds context limit`)
    return true
  }
  return false
}

function buildFallbackVulnerability(fastPass: FastPassResult): Vulnerability[] {
  if (fastPass.detectedTypes.length === 0) {
    return [{
      id: `vuln-${uuidv4()}`,
      filePath: fastPass.filePath,
      severity: (fastPass.riskLevel === 'HIGH' ? 'HIGH' : 'MEDIUM') as Severity,
      category: 'SECURITY_MISCONFIGURATION' as VulnCategory,
      title: `Potential security issue in ${fastPass.filePath.split('/').pop()}`,
      description: `Scanner flagged this file as ${fastPass.riskLevel} risk. Review manually.`,
      fixSuggestion: 'Review this file for hardcoded secrets, injection vulnerabilities, and insecure patterns.',
      detectedBy: 'watsonx',
    }]
  }
  return []
}

function deduplicateVulnerabilities(vulns: Vulnerability[]): Vulnerability[] {
  const seen = new Set<string>()
  return vulns.filter((v) => {
    const key = `${v.filePath}:${v.lineNumber ?? 'noLine'}:${v.category}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function processFile(file: RepoFile): Promise<{ fastPass: FastPassResult; vulns: Vulnerability[] }> {
  try {
    const { fastPass, vulnerabilities } = await claudeScanFile(file.path, file.language, file.content)

    // Promote LOW → MEDIUM if vulnerabilities were actually found
    if (vulnerabilities.length > 0 && (fastPass.riskLevel === 'LOW' || fastPass.riskLevel === 'CLEAN')) {
      fastPass.riskLevel = 'MEDIUM'
    }

    let finalVulns = vulnerabilities

    // If Claude said HIGH but produced no vulns, fall back to a placeholder
    if (finalVulns.length === 0 && (fastPass.riskLevel === 'HIGH' || fastPass.riskLevel === 'MEDIUM')) {
      finalVulns = buildFallbackVulnerability(fastPass)
      console.log(`[deep-scan] Using ${finalVulns.length} fallback finding(s) for ${file.path}`)
    }

    // Backfill missing code snippets using file content + line numbers
    const lines = file.content.split('\n')
    for (const v of finalVulns) {
      if (!v.codeSnippet && v.lineNumber) {
        const start = Math.max(0, v.lineNumber - 2)
        const end = Math.min(lines.length, v.lineNumber + 1)
        v.codeSnippet = lines.slice(start, end).join('\n')
      } else if (!v.codeSnippet) {
        // No line number either — use first few lines as fallback
        v.codeSnippet = lines.slice(0, 5).join('\n')
      }
    }

    return { fastPass, vulns: finalVulns }
  } catch (err) {
    console.warn(`[scan] Claude failed for ${file.path}: ${err instanceof Error ? err.message : String(err)}`)
    return {
      fastPass: { filePath: file.path, riskLevel: 'LOW', detectedTypes: [], confidence: 0 },
      vulns: [],
    }
  }
}

export interface FileProgressEvent {
  progress: number
  completed: number
  total: number
  filePath: string
  riskLevel: FastPassResult['riskLevel']
  issuesFound: number
  findings: Vulnerability[]
}

/**
 * Run Claude-based scan on all files with bounded parallelism.
 * Uses a sliding-window worker pool so faster files don't wait on slower ones.
 */
export async function runFastPassAndDeepScan(
  files: RepoFile[],
  onProgress?: (event: FileProgressEvent) => void
): Promise<{ fastPassResults: FastPassResult[]; rawVulnerabilities: Vulnerability[] }> {
  const scannable = files.filter((f) => !shouldSkipFile(f))
  const skipped = files.length - scannable.length
  if (skipped > 0) {
    console.log(`[scan] Skipping ${skipped} non-scannable files, scanning ${scannable.length}`)
  }

  const fastPassResults: FastPassResult[] = []
  const allVulns: Vulnerability[] = []
  let completed = 0
  let issuesFound = 0
  let cursor = 0

  async function worker() {
    while (true) {
      const idx = cursor++
      if (idx >= scannable.length) return
      const file = scannable[idx]
      const { fastPass, vulns } = await processFile(file)

      fastPassResults.push(fastPass)
      allVulns.push(...vulns)
      issuesFound += vulns.length
      completed++

      onProgress?.({
        progress: completed / scannable.length,
        completed,
        total: scannable.length,
        filePath: file.path,
        riskLevel: fastPass.riskLevel,
        issuesFound,
        findings: vulns,
      })
    }
  }

  const workers = Array.from(
    { length: Math.min(CLAUDE_CONCURRENCY, scannable.length) },
    () => worker()
  )
  await Promise.all(workers)

  return {
    fastPassResults,
    rawVulnerabilities: deduplicateVulnerabilities(allVulns),
  }
}
