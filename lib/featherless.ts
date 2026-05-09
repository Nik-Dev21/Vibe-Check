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
 * Lightweight ping — checks if Featherless API is reachable.
 */
export async function pingFeatherless(): Promise<void> {
  const client = getClient()
  // List models — cheapest possible API call
  await client.models.list()
}
