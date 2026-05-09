/**
 * POST /api/fix
 * Accepts a vulnerability ID + code snippet, returns an auto-fix diff.
 * watsonx.ai generates the patch — may take 5–15s.
 */

import { z } from 'zod'
import { generateFix, buildVulnerabilityFromFixRequest } from '@/lib/scanner/auto-fix'
import type { FixResponse } from '@/lib/types'

export const maxDuration = 60

const FixRequestSchema = z.object({
  vulnerabilityId: z.string().min(1, 'vulnerabilityId is required'),
  filePath: z.string().min(1, 'filePath is required'),
  codeSnippet: z.string().min(1, 'codeSnippet is required'),
})

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON in request body' }, { status: 400 })
  }

  const parsed = FixRequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 400 }
    )
  }

  const { vulnerabilityId, filePath, codeSnippet } = parsed.data

  try {
    const vuln = buildVulnerabilityFromFixRequest({ vulnerabilityId, filePath, codeSnippet })
    const fix = await generateFix(vuln, codeSnippet)

    const responseBody: FixResponse = {
      original: fix.original,
      fixed: fix.fixed,
      explanation: fix.explanation,
    }

    return Response.json(responseBody)

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[POST /api/fix] Error: ${message}`)
    return Response.json({ error: message }, { status: 500 })
  }
}
