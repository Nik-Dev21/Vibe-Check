import { getIBMToken } from './iam'
import type { Vulnerability, VulnCategory, Severity } from '../types'

const WATSONX_BASE_URL = 'https://ca-tor.ml.cloud.ibm.com'
const WATSONX_ENDPOINT = '/ml/v1/text/generation?version=2023-05-29'

async function generateText(prompt: string): Promise<string> {
  const token = await getIBMToken()
  const res = await fetch(`${WATSONX_BASE_URL}${WATSONX_ENDPOINT}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model_id: process.env.WATSONX_MODEL_ID,
      input: prompt,
      parameters: {
        decoding_method: 'greedy',
        max_new_tokens: 2000,
        repetition_penalty: 1.05,
      },
      project_id: process.env.WATSONX_PROJECT_ID,
    }),
  })
  if (!res.ok) {
    throw new Error(`watsonx.ai request failed: ${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  return data.results?.[0]?.generated_text ?? ''
}

export interface DeepScanResult {
  lineNumber?: number
  severity: Severity
  category: VulnCategory
  title: string
  description: string
  fixSuggestion: string
  codeSnippet?: string
  cveReference?: string | null
}

export async function deepScanFile(filePath: string, content: string): Promise<DeepScanResult[]> {
  const prompt = `You are an expert security auditor. Perform a comprehensive vulnerability analysis on this code.

File: ${filePath}
Content:
${content}

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
}]`

  const raw = await generateText(prompt)
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) return []
  try {
    return JSON.parse(match[0]) as DeepScanResult[]
  } catch {
    return []
  }
}

export interface AutoFixResult {
  original: string
  fixed: string
  explanation: string
}

export async function generateAutoFix(
  filePath: string,
  title: string,
  category: string,
  severity: string,
  codeSnippet: string,
): Promise<AutoFixResult> {
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
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('watsonx.ai returned no parseable JSON for auto-fix')
  return JSON.parse(match[0]) as AutoFixResult
}
