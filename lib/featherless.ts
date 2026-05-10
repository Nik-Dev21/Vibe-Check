/**
 * lib/featherless.ts
 * Featherless AI client — OpenAI-compatible interface.
 * Reads: FEATHERLESS_API_KEY, FEATHERLESS_BASE_URL, FEATHERLESS_MODEL
 * Used for fast-pass file classification (Phase 2 of scan pipeline).
 */

import OpenAI from 'openai'
import { z } from 'zod'
import type { FastPassResult, VulnCategory } from './types'

// ── Constants ───────────────────────────────────────────────────────────────────────

/** Featherless plan allows 48k tokens; ~3.5 chars/token → truncate at 40k chars */
export const MAX_FILE_CHARS = 40_000

export const VALID_CATEGORIES: VulnCategory[] = [
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

// ── Zod schema for Featherless fast-pass response ────────────────────────────

// detectedTypes accepts any string and filters to known categories at transform time.
// This prevents hard schema failures when the LLM returns a slightly different label.
const FastPassResponseSchema = z.object({
  riskLevel: z.enum(['HIGH', 'MEDIUM', 'LOW', 'CLEAN']).catch('LOW'),
  detectedTypes: z
    .array(z.string())
    .transform((arr) =>
      arr.filter((v): v is VulnCategory =>
        VALID_CATEGORIES.includes(v as VulnCategory)
      )
    )
    .catch([]),
  confidence: z.number().min(0).max(1).catch(0.5),
  topIssue: z.string().nullable().optional(),
})

// ── Singleton client ──────────────────────────────────────────────────────────

let featherlessClient: OpenAI | null = null

function getClient(): OpenAI {
  if (featherlessClient) return featherlessClient

  const apiKey = process.env.FEATHERLESS_API_KEY
  const baseURL = process.env.FEATHERLESS_BASE_URL

  if (!apiKey) throw new Error('[Featherless] FEATHERLESS_API_KEY is not set')
  if (!baseURL) throw new Error('[Featherless] FEATHERLESS_BASE_URL is not set')

  featherlessClient = new OpenAI({ apiKey, baseURL })
  return featherlessClient
}

function getModel(): string {
  return process.env.FEATHERLESS_MODEL ?? 'Qwen/Qwen2.5-Coder-32B-Instruct'
}

// ── Exported function ─────────────────────────────────────────────────────────

/**
 * Classify a single file for security risk using Featherless (fast-pass).
 * Returns a FastPassResult with riskLevel, detectedTypes, and confidence.
 */
export async function classifyFile(
  filePath: string,
  language: string,
  fileContent: string
): Promise<FastPassResult> {
  const client = getClient()
  const model = getModel()

  const truncated = fileContent.slice(0, MAX_FILE_CHARS)

  const prompt = `You are a security code scanner. Analyze the following code file and classify it.

File: ${filePath}
Language: ${language}
Content:
${truncated}

Respond ONLY with valid JSON in this exact format (no markdown, no extra text):
{
  "riskLevel": "HIGH" | "MEDIUM" | "LOW" | "CLEAN",
  "detectedTypes": [<zero or more from the list below>],
  "confidence": <number 0.0 to 1.0>,
  "topIssue": "<one-sentence summary>" | null
}

valid detectedTypes values (use ONLY these exact strings):
HARDCODED_SECRET, SQL_INJECTION, XSS, BROKEN_AUTH, INSECURE_DEPENDENCY,
SENSITIVE_DATA_EXPOSURE, SECURITY_MISCONFIGURATION, IDOR, SSRF, PATH_TRAVERSAL`

  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    max_tokens: 300,
  })

  const raw = completion.choices[0]?.message?.content?.trim() ?? ''

  // Extract JSON — model may wrap it in markdown code fences
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    // If model returns nothing parseable, default to LOW to avoid blocking the scan
    console.warn(`[Featherless] No JSON in response for ${filePath}, defaulting to LOW`)
    return { filePath, riskLevel: 'LOW', detectedTypes: [], confidence: 0 }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    console.warn(`[Featherless] JSON parse failed for ${filePath}, defaulting to LOW`)
    return { filePath, riskLevel: 'LOW', detectedTypes: [], confidence: 0 }
  }

  const result = FastPassResponseSchema.safeParse(parsed)
  if (!result.success) {
    console.warn(
      `[Featherless] Schema validation failed for ${filePath}:`,
      JSON.stringify(result.error.issues, null, 2)
    )
    return { filePath, riskLevel: 'LOW', detectedTypes: [], confidence: 0 }
  }

  return {
    filePath,
    riskLevel: result.data.riskLevel,
    detectedTypes: result.data.detectedTypes as VulnCategory[],
    confidence: result.data.confidence,
  }
}

/**
 * Deep-scan a single file for vulnerabilities using Featherless.
 * Returns a structured list of findings (may be empty if file is clean).
 */
export async function deepScanFile(
  filePath: string,
  fileContent: string
): Promise<import('./types').Vulnerability[]> {
  const client = getClient()
  const model = getModel()
  const { v4: uuidv4 } = await import('uuid')

  const truncated = fileContent.slice(0, MAX_FILE_CHARS)

  const prompt = `You are an expert security auditor. Perform a comprehensive vulnerability analysis on this code.

File: ${filePath}
Content:
${truncated}

Identify ALL security vulnerabilities. Respond ONLY with a valid JSON array (no markdown, no extra text):
[{
  "lineNumber": 42,
  "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO",
  "category": "HARDCODED_SECRET" | "SQL_INJECTION" | "XSS" | "BROKEN_AUTH" | "INSECURE_DEPENDENCY" | "SENSITIVE_DATA_EXPOSURE" | "SECURITY_MISCONFIGURATION" | "IDOR" | "SSRF" | "PATH_TRAVERSAL",
  "title": "short title",
  "description": "Two sentence plain-English description.",
  "fixSuggestion": "Actionable one-sentence fix.",
  "codeSnippet": "exact vulnerable line(s)",
  "cveReference": "CVE-XXXX-XXXX or null"
}]

If there are no vulnerabilities, respond with: []`

  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    max_tokens: 1200,
  })

  const raw = completion.choices[0]?.message?.content?.trim() ?? ''
  const jsonMatch = raw.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return []
  }

  if (!Array.isArray(parsed)) return []

  const DeepFindingSchema = z.object({
    lineNumber: z.number().optional(),
    severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']),
    category: z.enum([
      'HARDCODED_SECRET', 'SQL_INJECTION', 'XSS', 'BROKEN_AUTH',
      'INSECURE_DEPENDENCY', 'SENSITIVE_DATA_EXPOSURE', 'SECURITY_MISCONFIGURATION',
      'IDOR', 'SSRF', 'PATH_TRAVERSAL',
    ]),
    title: z.string(),
    description: z.string(),
    fixSuggestion: z.string(),
    codeSnippet: z.string().optional(),
    cveReference: z.string().nullable().optional(),
  })

  const findings: import('./types').Vulnerability[] = []
  for (const item of parsed) {
    const result = DeepFindingSchema.safeParse(item)
    if (!result.success) continue
    findings.push({
      id: `vuln-${uuidv4()}`,
      filePath,
      lineNumber: result.data.lineNumber,
      severity: result.data.severity as import('./types').Severity,
      category: result.data.category as import('./types').VulnCategory,
      title: result.data.title,
      description: result.data.description,
      fixSuggestion: result.data.fixSuggestion,
      codeSnippet: result.data.codeSnippet,
      cveReference: result.data.cveReference ?? undefined,
      detectedBy: 'featherless',
    })
  }

  return findings
}

/**
 * Generate an auto-fix patch for a single vulnerability using Featherless.
 */
export async function generateAutoFix(
  filePath: string,
  title: string,
  category: string,
  severity: string,
  codeSnippet: string
): Promise<{ original: string; fixed: string; explanation: string }> {
  const client = getClient()
  const model = getModel()

  const prompt = `You are a security engineer. Fix the following vulnerability in this code.

File: ${filePath}
Vulnerability: ${title}
Category: ${category}
Severity: ${severity}
Vulnerable code:
${codeSnippet}

Return ONLY valid JSON (no markdown, no extra text):
{
  "original": "the exact vulnerable code snippet",
  "fixed": "the corrected replacement code",
  "explanation": "one sentence explaining what changed and why it's now secure"
}

Rules:
- Only change the minimum code necessary to fix this specific vulnerability
- Preserve all existing logic, formatting, and surrounding code style
- Do not introduce new dependencies unless absolutely required
- The fixed code must be a drop-in replacement for the original snippet`

  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    max_tokens: 1000,
  })

  const raw = completion.choices[0]?.message?.content?.trim() ?? ''
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('[Featherless] generateAutoFix returned no JSON')

  const AutoFixSchema = z.object({
    original: z.string(),
    fixed: z.string(),
    explanation: z.string(),
  })

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    throw new Error(`[Featherless] generateAutoFix JSON parse error: ${jsonMatch[0].slice(0, 200)}`)
  }

  const result = AutoFixSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`[Featherless] generateAutoFix schema validation failed: ${result.error.message}`)
  }

  return result.data
}

/**
 * Lightweight ping — checks if Featherless API is reachable.
 */
export async function pingFeatherless(): Promise<void> {
  const client = getClient()
  // List models — cheapest possible API call
  await client.models.list()
}
