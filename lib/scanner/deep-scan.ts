/**
 * lib/scanner/deep-scan.ts
 * Parallel deep-scan — Phase 3 of the scan pipeline.
 * HIGH files: Featherless + watsonx run simultaneously per file, results merged.
 * MEDIUM files: Featherless only (cost control).
 * Falls back to fast-pass findings if both fail.
 */

import { v4 as uuidv4 } from 'uuid'
import { deepScanFile as featherlessDeepScan } from '../featherless'
import { deepScanFile as watsonxDeepScan } from '../ibm/watsonx'
import type { RepoFile, FastPassResult, Vulnerability, Severity, VulnCategory } from '../types'

// Featherless: 1 slot at a time (2 units/req, plan limit 4 — keep 2 units headroom)
// watsonx: no concurrency limit — runs in parallel with Featherless freely
// Strategy: process files one at a time through Featherless, but fire watsonx in parallel
const FEATHERLESS_CONCURRENCY = 1

/**
 * Build a fallback Vulnerability from a fast-pass result when deep scan fails.
 * This ensures users still see findings even if watsonx.ai is unavailable.
 */
function buildFallbackVulnerability(
  fastPass: FastPassResult
): Vulnerability[] {
  if (fastPass.detectedTypes.length === 0) {
    // Fast-pass flagged it as risky but gave no specific types — create a generic finding
    return [{
      id: `vuln-${uuidv4()}`,
      filePath: fastPass.filePath,
      severity: fastPass.riskLevel === 'HIGH' ? 'HIGH' : 'MEDIUM',
      category: 'SECURITY_MISCONFIGURATION' as VulnCategory,
      title: `Potential security issue detected in ${fastPass.filePath.split('/').pop()}`,
      description: `The fast-pass scanner flagged this file as ${fastPass.riskLevel} risk with ${(fastPass.confidence * 100).toFixed(0)}% confidence. Deep analysis was unavailable — review this file manually.`,
      fixSuggestion: 'Review this file for hardcoded secrets, injection vulnerabilities, and insecure patterns.',
      detectedBy: 'featherless',
    }]
  }

  // Create one vulnerability per detected type
  return fastPass.detectedTypes.map((category) => ({
    id: `vuln-${uuidv4()}`,
    filePath: fastPass.filePath,
    severity: (fastPass.riskLevel === 'HIGH' ? 'HIGH' : 'MEDIUM') as Severity,
    category,
    title: `${formatCategory(category)} detected in ${fastPass.filePath.split('/').pop()}`,
    description: `Fast-pass scan detected ${formatCategory(category).toLowerCase()} in this file with ${(fastPass.confidence * 100).toFixed(0)}% confidence. Deep analysis was unavailable for detailed line-level findings.`,
    fixSuggestion: getFallbackFix(category),
    detectedBy: 'featherless' as const,
  }))
}

function formatCategory(cat: VulnCategory): string {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function getFallbackFix(category: VulnCategory): string {
  const fixes: Record<VulnCategory, string> = {
    HARDCODED_SECRET: 'Move secrets to environment variables and use a secrets manager.',
    SQL_INJECTION: 'Use parameterized queries or prepared statements instead of string concatenation.',
    XSS: 'Sanitize and escape all user input before rendering in HTML.',
    BROKEN_AUTH: 'Use jwt.verify() instead of jwt.decode(), validate tokens on every request.',
    INSECURE_DEPENDENCY: 'Update vulnerable dependencies to their latest patched versions.',
    SENSITIVE_DATA_EXPOSURE: 'Never log or store sensitive data (card numbers, SSNs) in plaintext.',
    SECURITY_MISCONFIGURATION: 'Review security headers, CORS policy, and debug settings.',
    IDOR: 'Validate that the authenticated user owns the requested resource before returning it.',
    SSRF: 'Validate and allowlist URLs before making server-side requests.',
    PATH_TRAVERSAL: 'Sanitize file paths and resolve against a safe base directory.',
  }
  return fixes[category]
}

/**
 * Scan a single file with both Featherless and watsonx in parallel.
 * HIGH files: both models run simultaneously, results merged.
 * MEDIUM files: Featherless only (cost control).
 */
async function scanFileParallel(
  file: RepoFile,
  riskLevel: 'HIGH' | 'MEDIUM',
  fastPass: FastPassResult
): Promise<Vulnerability[]> {
  const useWatsonx = riskLevel === 'HIGH'

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

  // If both failed, fall back to fast-pass findings
  if (vulns.length === 0) {
    const fallbacks = buildFallbackVulnerability(fastPass)
    console.log(`[deep-scan] Using ${fallbacks.length} fallback finding(s) for ${file.path}`)
    return fallbacks
  }

  return vulns
}

/**
 * Run parallel deep analysis on HIGH and MEDIUM risk files.
 * HIGH files get both Featherless + watsonx simultaneously.
 * MEDIUM files get Featherless only.
 * Files are processed one at a time through Featherless to respect the concurrency limit,
 * while watsonx runs freely in parallel alongside each Featherless request.
 */
export async function runDeepScan(
  files: RepoFile[],
  fastPassResults: FastPassResult[]
): Promise<Vulnerability[]> {
  const highRiskResults = fastPassResults.filter(
    (r) => r.riskLevel === 'HIGH' || r.riskLevel === 'MEDIUM'
  )

  if (highRiskResults.length === 0) return []

  const fileByPath = new Map(files.map((f) => [f.path, f]))
  const fastPassByPath = new Map(highRiskResults.map((r) => [r.filePath, r]))

  const allVulnerabilities: Vulnerability[] = []

  // Process files sequentially to respect Featherless concurrency limit (1 at a time).
  // watsonx fires in parallel inside each scanFileParallel call — no extra cost.
  for (const fp of highRiskResults) {
    const file = fileByPath.get(fp.filePath)
    if (!file) continue

    try {
      const vulns = await scanFileParallel(file, fp.riskLevel as 'HIGH' | 'MEDIUM', fastPassByPath.get(fp.filePath)!)
      allVulnerabilities.push(...vulns)
    } catch (err) {
      console.warn(`[deep-scan] scanFileParallel failed for ${fp.filePath}: ${err instanceof Error ? err.message : String(err)}`)
      const fallbacks = buildFallbackVulnerability(fp)
      allVulnerabilities.push(...fallbacks)
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
