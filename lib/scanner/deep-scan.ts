/**
 * lib/scanner/deep-scan.ts
 * watsonx.ai Granite deep-scan — Phase 3 of the scan pipeline.
 * Only runs on HIGH + MEDIUM files from the fast-pass.
 * Returns a deduplicated list of Vulnerability objects.
 *
 * If watsonx.ai is unavailable, generates fallback findings from fast-pass
 * classifications so the report is never empty when issues were detected.
 */

import { v4 as uuidv4 } from 'uuid'
import { deepScanFile } from '../ibm/watsonx'
import type { RepoFile, FastPassResult, Vulnerability, Severity, VulnCategory } from '../types'

// Max concurrent watsonx.ai requests (more expensive — keep low)
const CONCURRENCY = 5

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
 * Run watsonx.ai deep analysis on HIGH and MEDIUM risk files.
 * Files classified LOW or CLEAN by fast-pass are skipped entirely.
 * Falls back to fast-pass findings when watsonx.ai is unavailable.
 */
export async function runDeepScan(
  files: RepoFile[],
  fastPassResults: FastPassResult[]
): Promise<Vulnerability[]> {
  // Build a set of paths that need deep analysis
  const highRiskResults = fastPassResults.filter(
    (r) => r.riskLevel === 'HIGH' || r.riskLevel === 'MEDIUM'
  )
  const highRiskPaths = new Set(highRiskResults.map((r) => r.filePath))

  const filesToScan = files.filter((f) => highRiskPaths.has(f.path))

  if (filesToScan.length === 0) return []

  // Index fast-pass results by path for fallback lookup
  const fastPassByPath = new Map(
    highRiskResults.map((r) => [r.filePath, r])
  )

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
        // Fallback: use fast-pass classification to generate findings
        const fastPass = fastPassByPath.get(batch[j].path)
        if (fastPass) {
          const fallbacks = buildFallbackVulnerability(fastPass)
          allVulnerabilities.push(...fallbacks)
          console.log(
            `[deep-scan] Generated ${fallbacks.length} fallback finding(s) from fast-pass for ${batch[j].path}`
          )
        }
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
