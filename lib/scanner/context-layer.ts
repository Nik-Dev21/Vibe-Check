/**
 * lib/scanner/context-layer.ts
 * Local README keyword scan — replaces the old Watson NLU call.
 * Runs synchronously (no network) and adds zero latency to the pipeline.
 */

import type { RepoFile, Vulnerability, ScanReport } from '../types'

type ContextRisk = ScanReport['contextRisk']

const PAYMENT_KEYWORDS = ['stripe', 'payment', 'billing', 'checkout', 'invoice', 'subscription', 'credit card', 'paypal']
const AUTH_KEYWORDS = ['login', 'logout', 'auth', 'jwt', 'session', 'password', 'oauth', 'token', 'signin', 'signup']
const PUBLIC_KEYWORDS = ['api', 'public', 'endpoint', 'rest', 'graphql', 'webhook', 'url', 'route', 'server']
const SENSITIVE_KEYWORDS = ['health', 'medical', 'hipaa', 'gdpr', 'pii', 'ssn', 'financial', 'bank', 'phi', 'patient']
const CRITICAL_KEYWORDS = ['hipaa', 'phi', 'ssn', 'medical record', 'health record']

function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n))
}

function findReadme(files: RepoFile[]): RepoFile | undefined {
  return files.find((f) => {
    const lower = f.path.toLowerCase()
    return lower === 'readme.md' || lower === 'readme.txt' || lower === 'readme'
  })
}

/**
 * MEDIUM → HIGH for SENSITIVE; HIGH → CRITICAL for CRITICAL apps.
 */
export function escalateSeverities(
  vulnerabilities: Vulnerability[],
  contextRisk: ContextRisk
): Vulnerability[] {
  if (contextRisk.dataClassification === 'PUBLIC' || contextRisk.dataClassification === 'INTERNAL') {
    return vulnerabilities
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
 * Synchronous README keyword scan — no API calls, no network latency.
 * Falls back to safe INTERNAL defaults if no README is present.
 */
export function enrichContext(files: RepoFile[]): ContextRisk {
  const readme = findReadme(files)
  if (!readme) {
    return { isPublicFacing: false, hasAuth: false, hasPayments: false, dataClassification: 'INTERNAL' }
  }

  const text = readme.content.toLowerCase()
  const hasPayments = containsAny(text, PAYMENT_KEYWORDS)
  const hasAuth = containsAny(text, AUTH_KEYWORDS)
  const isPublicFacing = containsAny(text, PUBLIC_KEYWORDS)
  const isSensitive = containsAny(text, SENSITIVE_KEYWORDS)
  const isCritical = containsAny(text, CRITICAL_KEYWORDS)

  const dataClassification: ContextRisk['dataClassification'] =
    isCritical ? 'CRITICAL'
    : isSensitive ? 'SENSITIVE'
    : hasPayments || hasAuth ? 'INTERNAL'
    : 'PUBLIC'

  return { isPublicFacing, hasAuth, hasPayments, dataClassification }
}
