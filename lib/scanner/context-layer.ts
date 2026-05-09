/**
 * lib/scanner/context-layer.ts
 * Watson NLU context enrichment — Phase 4 of the scan pipeline.
 * Analyzes README to detect app type and escalates severity for sensitive apps.
 */

import { analyzeText } from '../ibm/nlu'
import type { RepoFile, Vulnerability, ScanReport } from '../types'

type ContextRisk = ScanReport['contextRisk']

// Keywords that indicate the app handles payments
const PAYMENT_KEYWORDS = ['stripe', 'payment', 'billing', 'checkout', 'invoice', 'subscription', 'credit card', 'paypal']
// Keywords that indicate the app has authentication
const AUTH_KEYWORDS = ['login', 'logout', 'auth', 'jwt', 'session', 'password', 'oauth', 'token', 'signin', 'signup']
// Keywords that indicate the app is public-facing (has an API/web layer)
const PUBLIC_KEYWORDS = ['api', 'public', 'endpoint', 'rest', 'graphql', 'webhook', 'url', 'route', 'server']
// Keywords that indicate healthcare/financial/sensitive data
const SENSITIVE_KEYWORDS = ['health', 'medical', 'hipaa', 'gdpr', 'pii', 'ssn', 'financial', 'bank', 'phi', 'patient']
const CRITICAL_KEYWORDS = ['hipaa', 'phi', 'ssn', 'medical record', 'health record']

function containsAny(haystack: string[], needles: string[]): boolean {
  return needles.some((needle) =>
    haystack.some((kw) => kw.includes(needle) || needle.includes(kw))
  )
}

/**
 * Find the README file in the repo's file list.
 */
function findReadme(files: RepoFile[]): RepoFile | undefined {
  return files.find((f) =>
    f.path.toLowerCase() === 'readme.md' ||
    f.path.toLowerCase() === 'readme.txt' ||
    f.path.toLowerCase() === 'readme'
  )
}

/**
 * Determine contextRisk from NLU keywords and entities.
 */
function inferContextRisk(keywords: string[], entities: string[]): ContextRisk {
  const allTerms = [...keywords, ...entities]

  const hasPayments = containsAny(allTerms, PAYMENT_KEYWORDS)
  const hasAuth = containsAny(allTerms, AUTH_KEYWORDS)
  const isPublicFacing = containsAny(allTerms, PUBLIC_KEYWORDS)
  const isSensitive = containsAny(allTerms, SENSITIVE_KEYWORDS)
  const isCritical = containsAny(allTerms, CRITICAL_KEYWORDS)

  const dataClassification: ContextRisk['dataClassification'] =
    isCritical ? 'CRITICAL'
    : isSensitive ? 'SENSITIVE'
    : hasPayments || hasAuth ? 'INTERNAL'
    : 'PUBLIC'

  return { isPublicFacing, hasAuth, hasPayments, dataClassification }
}

/**
 * Escalate severity of existing vulnerabilities for SENSITIVE/CRITICAL apps.
 * MEDIUM → HIGH for SENSITIVE; HIGH → CRITICAL for CRITICAL classified apps.
 */
export function escalateSeverities(
  vulnerabilities: Vulnerability[],
  contextRisk: ContextRisk
): Vulnerability[] {
  if (contextRisk.dataClassification === 'PUBLIC' || contextRisk.dataClassification === 'INTERNAL') {
    return vulnerabilities // no escalation needed
  }

  return vulnerabilities.map((v) => {
    if (contextRisk.dataClassification === 'CRITICAL') {
      if (v.severity === 'HIGH') return { ...v, severity: 'CRITICAL' as const }
      if (v.severity === 'MEDIUM') return { ...v, severity: 'HIGH' as const }
    } else if (contextRisk.dataClassification === 'SENSITIVE') {
      if (v.severity === 'MEDIUM') return { ...v, severity: 'HIGH' as const }
    }
    return v
  })
}

/**
 * Phase 4: Enrich scan context using Watson NLU on the README.
 * Returns contextRisk — if no README found, returns safe defaults.
 */
export async function enrichContext(
  files: RepoFile[]
): Promise<ContextRisk> {
  const readme = findReadme(files)

  if (!readme) {
    // No README — can't determine context, use safe defaults
    return {
      isPublicFacing: false,
      hasAuth: false,
      hasPayments: false,
      dataClassification: 'INTERNAL',
    }
  }

  try {
    const analysis = await analyzeText(readme.content)
    return inferContextRisk(analysis.keywords, analysis.entities)
  } catch (err) {
    console.warn(
      `[context-layer] NLU analysis failed: ${
        err instanceof Error ? err.message : String(err)
      }. Using defaults.`
    )
    // NLU failure must not block the scan — return conservative defaults
    return {
      isPublicFacing: true,
      hasAuth: false,
      hasPayments: false,
      dataClassification: 'INTERNAL',
    }
  }
}
