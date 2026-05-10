/**
 * lib/ibm/watsonx.ts
 * IBM watsonx.ai Granite client.
 * Reads: WATSONX_URL, WATSONX_PROJECT_ID, WATSONX_MODEL_ID
 * Two exported functions:
 *   - deepScanFile()  → structured Vulnerability[] from deep-scan prompt
 *   - generateAutoFix() → { original, fixed, explanation } from auto-fix prompt
 */

import { z } from 'zod'
import { getIBMToken } from './iam'
import type { Vulnerability, VulnCategory, Severity } from '../types'

// ── Zod schemas ────────────────────────────────────────────────────────────────

const DeepScanFindingSchema = z.object({
  lineNumber: z.number().optional(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']),
  category: z.enum([
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
  ]),
  title: z.string(),
  description: z.string(),
  fixSuggestion: z.string(),
  codeSnippet: z.string().optional(),
  cveReference: z.string().nullable().optional(),
})

const AutoFixSchema = z.object({
  original: z.string(),
  fixed: z.string(),
  explanation: z.string(),
})

// ── Internal helper ─────────────────────────────────────────────────────────────

async function generateText(prompt: string): Promise<string> {
  const baseUrl = process.env.WATSONX_URL
  const projectId = process.env.WATSONX_PROJECT_ID
  const modelId = process.env.WATSONX_MODEL_ID

  if (!baseUrl) throw new Error('[watsonx] WATSONX_URL is not set')
  if (!projectId) throw new Error('[watsonx] WATSONX_PROJECT_ID is not set')
  if (!modelId) throw new Error('[watsonx] WATSONX_MODEL_ID is not set')

  const token = await getIBMToken()

  // Use the chat endpoint (OpenAI-compatible) — works with llama-3-3-70b-instruct
  const payload = {
    model_id: modelId,
    messages: [{ role: 'user', content: prompt }],
    parameters: { max_tokens: 2000 },
    project_id: projectId,
  }

  const res = await fetch(
    `${baseUrl}/ml/v1/text/chat?version=2023-05-29`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    }
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)')
    throw new Error(`[watsonx] Generation failed — HTTP ${res.status}: ${body}`)
  }

  const data = await res.json() as {
    choices?: Array<{ message: { content: string } }>
  }

  const generated = data.choices?.[0]?.message?.content
  if (!generated) {
    throw new Error('[watsonx] No content in response')
  }

  return generated.trim()
}

// ── Exported functions ──────────────────────────────────────────────────────────

/**
 * Run watsonx.ai deep scan on a single file.
 * Returns a list of Vulnerability objects (may be empty if file is clean).
 */
export async function deepScanFile(
  filePath: string,
  fileContent: string
): Promise<Vulnerability[]> {
  const prompt = `You are an expert security auditor. Perform a comprehensive vulnerability analysis on this code.

File: ${filePath}
Content:
${fileContent}

Identify ALL security vulnerabilities. For each finding respond ONLY with valid JSON array:
[{
  "lineNumber": 42,
  "severity": "CRITICAL",
  "category": "HARDCODED_SECRET",
  "title": "AWS API key hardcoded in source",
  "description": "Two sentence plain-English description.",
  "fixSuggestion": "Actionable one-sentence fix.",
  "codeSnippet": "exact vulnerable line(s)",
  "cveReference": "CVE-XXXX-XXXX or null"
}]

If there are no vulnerabilities, respond with an empty array: []`

  const raw = await generateText(prompt)

  // Extract JSON array from the response (model may include extra prose)
  const jsonMatch = raw.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    // Model returned prose with no JSON — treat as clean
    return []
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    throw new Error(`[watsonx] deepScanFile JSON parse error for ${filePath}: ${jsonMatch[0].slice(0, 200)}`)
  }

  if (!Array.isArray(parsed)) return []

  const findings: Vulnerability[] = []
  for (const item of parsed) {
    const result = DeepScanFindingSchema.safeParse(item)
    if (!result.success) continue // skip malformed entries

    findings.push({
      id: `watsonx-${filePath}-${result.data.lineNumber ?? findings.length}`,
      filePath,
      lineNumber: result.data.lineNumber,
      severity: result.data.severity as Severity,
      category: result.data.category as VulnCategory,
      title: result.data.title,
      description: result.data.description,
      fixSuggestion: result.data.fixSuggestion,
      codeSnippet: result.data.codeSnippet,
      cveReference: result.data.cveReference ?? undefined,
      detectedBy: 'watsonx',
    })
  }

  return findings
}

/**
 * Generate an auto-fix patch for a single vulnerability.
 */
export async function generateAutoFix(
  filePath: string,
  title: string,
  category: string,
  severity: string,
  codeSnippet: string
): Promise<{ original: string; fixed: string; explanation: string }> {
  const prompt = `You are a security engineer. Fix the following vulnerability in this code.

File: ${filePath}
Vulnerability: ${title}
Category: ${category}
Severity: ${severity}
Vulnerable code:
${codeSnippet}

Return ONLY valid JSON, no other text:
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

  const raw = await generateText(prompt)

  // Extract JSON object from response
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error(`[watsonx] generateAutoFix returned no JSON for ${filePath}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    throw new Error(`[watsonx] generateAutoFix JSON parse error: ${jsonMatch[0].slice(0, 200)}`)
  }

  const result = AutoFixSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`[watsonx] generateAutoFix schema validation failed: ${result.error.message}`)
  }

  return result.data
}
