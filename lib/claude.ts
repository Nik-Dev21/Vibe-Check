/**
 * lib/claude.ts
 * Claude API client — Anthropic SDK.
 * Reads: CLAUDE_API_KEY, CLAUDE_MODEL (defaults to Haiku 4.5).
 *
 * One unified call per file: classify + deep-scan in a single request.
 * Returns { riskLevel, vulnerabilities[] }. Optimized for speed + cost
 * (Haiku 4.5 is ~$1 in / $5 out per MTok).
 */

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import type {
  FastPassResult,
  Vulnerability,
  VulnCategory,
  Severity,
} from './types'

/** Truncate large files — Haiku 200k context, but bigger files cost more & rarely help */
export const CLAUDE_MAX_FILE_CHARS = 40_000

const VALID_CATEGORIES: VulnCategory[] = [
  'HARDCODED_SECRET',
  'SQL_INJECTION',
  'XSS',
  'BROKEN_AUTH',
  'INSECURE_DEPENDENCY',
  'SENSITIVE_DATA_EXPOSURE',
  'SECURITY_MISCONFIGURATION',
  'IDOR',
  'SSRF',
  'PATH_TRAVERSAL',
]

const FindingSchema = z.object({
  lineNumber: z.number().optional(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']),
  category: z.enum([
    'HARDCODED_SECRET', 'SQL_INJECTION', 'XSS', 'BROKEN_AUTH',
    'INSECURE_DEPENDENCY', 'SENSITIVE_DATA_EXPOSURE',
    'SECURITY_MISCONFIGURATION', 'IDOR', 'SSRF', 'PATH_TRAVERSAL',
  ]),
  title: z.string(),
  description: z.string(),
  fixSuggestion: z.string(),
  codeSnippet: z.string().optional(),
  cveReference: z.string().nullable().optional(),
})

const ScanResponseSchema = z.object({
  riskLevel: z.enum(['HIGH', 'MEDIUM', 'LOW', 'CLEAN']).catch('LOW'),
  vulnerabilities: z.array(FindingSchema).catch([]),
})

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (client) return client
  const apiKey = process.env.CLAUDE_API_KEY
  if (!apiKey) throw new Error('[Claude] CLAUDE_API_KEY is not set')
  client = new Anthropic({ apiKey })
  return client
}

function getModel(): string {
  return process.env.CLAUDE_MODEL ?? 'claude-haiku-4-5-20251001'
}

function extractJson(raw: string): string | null {
  // Strip ```json fences if present, then grab first {...} block
  const stripped = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
  const match = stripped.match(/\{[\s\S]*\}/)
  return match ? match[0] : null
}

async function callClaude(prompt: string, maxTokens: number): Promise<string> {
  const c = getClient()
  const model = getModel()
  const response = await c.messages.create({
    model,
    max_tokens: maxTokens,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = response.content[0]
  if (!block || block.type !== 'text') return ''
  return block.text.trim()
}

/**
 * Single-call scan: classify risk + return vulnerabilities in one request.
 * Returns both the FastPassResult shape (for compatibility with existing UI)
 * and the full Vulnerability[] in one trip.
 */
export async function scanFile(
  filePath: string,
  language: string,
  fileContent: string
): Promise<{ fastPass: FastPassResult; vulnerabilities: Vulnerability[] }> {
  const truncated = fileContent.slice(0, CLAUDE_MAX_FILE_CHARS)

  const prompt = `You are an expert security auditor scanning AI-generated code for vulnerabilities.

File: ${filePath}
Language: ${language}
Content:
${truncated}

Classify the overall risk AND list every concrete security vulnerability you find.

Respond with ONLY valid JSON (no markdown, no commentary):
{
  "riskLevel": "HIGH" | "MEDIUM" | "LOW" | "CLEAN",
  "vulnerabilities": [
    {
      "lineNumber": <number>,
      "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO",
      "category": <one of: HARDCODED_SECRET, SQL_INJECTION, XSS, BROKEN_AUTH, INSECURE_DEPENDENCY, SENSITIVE_DATA_EXPOSURE, SECURITY_MISCONFIGURATION, IDOR, SSRF, PATH_TRAVERSAL>,
      "title": "<short title>",
      "description": "<two-sentence plain-English description>",
      "fixSuggestion": "<actionable one-sentence fix>",
      "codeSnippet": "<exact vulnerable line(s) from the file>",
      "cveReference": "<CVE-XXXX-XXXX or null>"
    }
  ]
}

Rules:
- riskLevel HIGH = real exploitable vulnerability present
- riskLevel MEDIUM = suspicious patterns worth review
- riskLevel LOW = minor concerns only
- riskLevel CLEAN = no security issues
- If no vulnerabilities, return "vulnerabilities": []
- Be concise. Skip stylistic nitpicks. Focus on shipped exploitable bugs.`

  const raw = await callClaude(prompt, 2000)
  const json = extractJson(raw)
  if (!json) {
    return {
      fastPass: { filePath, riskLevel: 'LOW', detectedTypes: [], confidence: 0 },
      vulnerabilities: [],
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return {
      fastPass: { filePath, riskLevel: 'LOW', detectedTypes: [], confidence: 0 },
      vulnerabilities: [],
    }
  }

  const result = ScanResponseSchema.safeParse(parsed)
  if (!result.success) {
    return {
      fastPass: { filePath, riskLevel: 'LOW', detectedTypes: [], confidence: 0 },
      vulnerabilities: [],
    }
  }

  const vulnerabilities: Vulnerability[] = result.data.vulnerabilities.map((v) => ({
    id: `vuln-${uuidv4()}`,
    filePath,
    lineNumber: v.lineNumber,
    severity: v.severity as Severity,
    category: v.category as VulnCategory,
    title: v.title,
    description: v.description,
    fixSuggestion: v.fixSuggestion,
    codeSnippet: v.codeSnippet,
    cveReference: v.cveReference ?? undefined,
    detectedBy: 'watsonx', // reuse existing union — UI badge stays consistent
  }))

  const detectedTypes = Array.from(
    new Set(
      vulnerabilities
        .map((v) => v.category)
        .filter((c): c is VulnCategory => VALID_CATEGORIES.includes(c))
    )
  )

  const fastPass: FastPassResult = {
    filePath,
    riskLevel: result.data.riskLevel,
    detectedTypes,
    confidence: vulnerabilities.length > 0 ? 0.9 : 0.6,
  }

  return { fastPass, vulnerabilities }
}

/**
 * Generate a minimal security patch for a single vulnerability.
 */
export async function generateAutoFix(
  filePath: string,
  title: string,
  category: string,
  severity: string,
  codeSnippet: string
): Promise<{ original: string; fixed: string; explanation: string }> {
  const prompt = `You are a security engineer. Fix the following vulnerability.

File: ${filePath}
Vulnerability: ${title}
Category: ${category}
Severity: ${severity}
Vulnerable code:
${codeSnippet}

Return ONLY valid JSON (no markdown):
{
  "original": "<exact vulnerable code snippet>",
  "fixed": "<corrected drop-in replacement>",
  "explanation": "<one sentence: what changed and why it's secure now>"
}

Rules:
- Change ONLY the minimum needed to fix this specific vulnerability
- Preserve existing logic, formatting, and surrounding code style
- Do not introduce new dependencies unless absolutely required
- The "fixed" string must be a drop-in replacement for "original"`

  const raw = await callClaude(prompt, 1000)
  const json = extractJson(raw)
  if (!json) throw new Error('[Claude] generateAutoFix returned no JSON')

  const AutoFixSchema = z.object({
    original: z.string(),
    fixed: z.string(),
    explanation: z.string(),
  })

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error(`[Claude] generateAutoFix JSON parse error: ${json.slice(0, 200)}`)
  }

  const result = AutoFixSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`[Claude] generateAutoFix schema validation failed: ${result.error.message}`)
  }
  return result.data
}

/** Lightweight ping — verifies the Claude API key is valid. */
export async function pingClaude(): Promise<void> {
  const c = getClient()
  await c.messages.create({
    model: getModel(),
    max_tokens: 4,
    messages: [{ role: 'user', content: 'ok' }],
  })
}
