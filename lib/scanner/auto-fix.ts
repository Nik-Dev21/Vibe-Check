/**
 * lib/scanner/auto-fix.ts
 * watsonx.ai auto-fix engine — Phase 6 (on-demand).
 * Generates minimal security patches for a single vulnerability.
 * Never rewrites surrounding code — drop-in replacement only.
 */

import { v4 as uuidv4 } from 'uuid'
import { generateAutoFix } from '../ibm/watsonx'
import type { Vulnerability, AutoFix } from '../types'

/**
 * Generate a security fix for a single vulnerability.
 * Returns an AutoFix object with original, fixed, and explanation.
 *
 * The codeSnippet from the Vulnerability is used as the vulnerable code input.
 * If no codeSnippet is attached, the caller must provide one via fixRequest.codeSnippet.
 */
export async function generateFix(
  vulnerability: Vulnerability,
  codeSnippet?: string
): Promise<AutoFix> {
  const snippet = codeSnippet ?? vulnerability.codeSnippet

  if (!snippet) {
    throw new Error(
      `[auto-fix] No code snippet available for vulnerability ${vulnerability.id}`
    )
  }

  const { original, fixed, explanation } = await generateAutoFix(
    vulnerability.filePath,
    vulnerability.title,
    vulnerability.category,
    vulnerability.severity,
    snippet
  )

  return {
    vulnerabilityId: vulnerability.id,
    filePath: vulnerability.filePath,
    original,
    fixed,
    explanation,
    status: 'generated',
  }
}

/**
 * Build a minimal Vulnerability object from the fields sent in a FixRequest.
 * Used by POST /api/fix when the full Vulnerability is not passed in.
 */
export function buildVulnerabilityFromFixRequest(params: {
  vulnerabilityId: string
  filePath: string
  codeSnippet: string
}): Vulnerability {
  return {
    id: params.vulnerabilityId || `vuln-${uuidv4()}`,
    filePath: params.filePath,
    severity: 'HIGH',            // conservative default
    category: 'HARDCODED_SECRET', // will be overridden by the actual prompt context
    title: 'Security vulnerability',
    description: 'Vulnerability submitted for auto-fix.',
    fixSuggestion: '',
    codeSnippet: params.codeSnippet,
    detectedBy: 'watsonx',
  }
}
