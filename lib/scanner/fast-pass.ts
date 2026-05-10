/**
 * lib/scanner/fast-pass.ts
 * Combined fast-pass + deep-scan pipeline.
 * Each file is classified by Featherless, then HIGH/MEDIUM files get deep-scanned
 * by Featherless (always) and watsonx (HIGH only) concurrently.
 * All files processed in parallel batches of CONCURRENCY.
 */

import { classifyFile, deepScanFile as featherlessDeepScan, MAX_FILE_CHARS } from '../featherless'
import { deepScanFile as watsonxDeepScan } from '../ibm/watsonx'
import { v4 as uuidv4 } from 'uuid'
import type { RepoFile, FastPassResult, Vulnerability, VulnCategory, Severity } from '../types'

// Featherless plan: 4 units/req limit — 2 concurrent = safe headroom
const CONCURRENCY = 2

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
  if (file.content.length > MAX_FILE_CHARS) {
    console.warn(`[fast-pass] Skipping ${file.path} — ${file.content.length} chars exceeds context limit`)
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
      description: `Fast-pass flagged this file as ${fastPass.riskLevel} risk (${(fastPass.confidence * 100).toFixed(0)}% confidence). Review manually.`,
      fixSuggestion: 'Review this file for hardcoded secrets, injection vulnerabilities, and insecure patterns.',
      detectedBy: 'featherless',
    }]
  }
  const fixes: Record<VulnCategory, string> = {
    HARDCODED_SECRET: 'Move secrets to environment variables and use a secrets manager.',
    SQL_INJECTION: 'Use parameterized queries or prepared statements instead of string concatenation.',
    XSS: 'Sanitize and escape all user input before rendering in HTML.',
    BROKEN_AUTH: 'Use jwt.verify() instead of jwt.decode(), validate tokens on every request.',
    INSECURE_DEPENDENCY: 'Update vulnerable dependencies to their latest patched versions.',
    SENSITIVE_DATA_EXPOSURE: 'Never log or store sensitive data in plaintext.',
    SECURITY_MISCONFIGURATION: 'Review security headers, CORS policy, and debug settings.',
    IDOR: 'Validate that the authenticated user owns the requested resource before returning it.',
    SSRF: 'Validate and allowlist URLs before making server-side requests.',
    PATH_TRAVERSAL: 'Sanitize file paths and resolve against a safe base directory.',
  }
  return fastPass.detectedTypes.map((category) => ({
    id: `vuln-${uuidv4()}`,
    filePath: fastPass.filePath,
    severity: (fastPass.riskLevel === 'HIGH' ? 'HIGH' : 'MEDIUM') as Severity,
    category,
    title: `${category.replace(/_/g, ' ')} detected in ${fastPass.filePath.split('/').pop()}`,
    description: `Fast-pass detected ${category.toLowerCase().replace(/_/g, ' ')} with ${(fastPass.confidence * 100).toFixed(0)}% confidence.`,
    fixSuggestion: fixes[category],
    detectedBy: 'featherless' as const,
  }))
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

/**
 * Classify a single file then immediately deep-scan it if HIGH/MEDIUM.
 * HIGH files: Featherless deep-scan + watsonx run in parallel.
 * MEDIUM files: Featherless deep-scan only.
 * LOW/CLEAN: stop after classification.
 */
async function processFile(file: RepoFile): Promise<{ fastPass: FastPassResult; vulns: Vulnerability[] }> {
  const fastPass = await classifyFile(file.path, file.language, file.content)

  if (fastPass.riskLevel === 'LOW' || fastPass.riskLevel === 'CLEAN') {
    return { fastPass, vulns: [] }
  }

  const useWatsonx = fastPass.riskLevel === 'HIGH'

  const [featherlessResult, watsonxResult] = await Promise.allSettled([
    featherlessDeepScan(file.path, file.content),
    useWatsonx ? watsonxDeepScan(file.path, file.content) : Promise.resolve([]),
  ])

  const vulns: Vulnerability[] = []

  if (featherlessResult.status === 'fulfilled') {
    vulns.push(...featherlessResult.value.map((v) => ({ ...v, id: `vuln-${uuidv4()}` })))
  } else {
    console.warn(`[deep-scan] Featherless failed for ${file.path}: ${featherlessResult.reason instanceof Error ? featherlessResult.reason.message : String(featherlessResult.reason)}`)
  }

  if (useWatsonx) {
    if (watsonxResult.status === 'fulfilled') {
      vulns.push(...watsonxResult.value.map((v) => ({ ...v, id: `vuln-${uuidv4()}` })))
    } else {
      console.warn(`[deep-scan] watsonx failed for ${file.path}: ${watsonxResult.reason instanceof Error ? watsonxResult.reason.message : String(watsonxResult.reason)}`)
    }
  }

  if (vulns.length === 0) {
    const fallbacks = buildFallbackVulnerability(fastPass)
    console.log(`[deep-scan] Using ${fallbacks.length} fallback finding(s) for ${file.path}`)
    return { fastPass, vulns: fallbacks }
  }

  return { fastPass, vulns }
}

/**
 * Run fast-pass classification + deep-scan for all files in concurrent batches.
 * onProgress callback receives 0→1 as files complete.
 */
export async function runFastPassAndDeepScan(
  files: RepoFile[],
  onProgress?: (progress: number) => void
): Promise<{ fastPassResults: FastPassResult[]; rawVulnerabilities: Vulnerability[] }> {
  const scannable = files.filter((f) => !shouldSkipFile(f))
  const skipped = files.length - scannable.length
  if (skipped > 0) {
    console.log(`[fast-pass] Skipping ${skipped} non-scannable files, scanning ${scannable.length}`)
  }

  const fastPassResults: FastPassResult[] = []
  const allVulns: Vulnerability[] = []
  let completed = 0

  for (let i = 0; i < scannable.length; i += CONCURRENCY) {
    const batch = scannable.slice(i, i + CONCURRENCY)
    const settled = await Promise.allSettled(batch.map((f) => processFile(f)))

    for (let j = 0; j < settled.length; j++) {
      const outcome = settled[j]
      if (outcome.status === 'fulfilled') {
        fastPassResults.push(outcome.value.fastPass)
        allVulns.push(...outcome.value.vulns)
      } else {
        console.warn(`[fast-pass] processFile failed for ${batch[j].path}: ${outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)}`)
        fastPassResults.push({ filePath: batch[j].path, riskLevel: 'LOW', detectedTypes: [], confidence: 0 })
      }
      completed++
      onProgress?.(completed / scannable.length)
    }
  }

  return {
    fastPassResults,
    rawVulnerabilities: deduplicateVulnerabilities(allVulns),
  }
}
