/**
 * POST /api/fix/push
 * Fetches the current file from GitHub, applies the fix, opens a PR.
 * User must explicitly click "Push as PR" — never auto-pushes.
 */

import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getFileContent, openPR, type PRVulnMeta } from '@/lib/github'
import type { FixPushResponse } from '@/lib/types'

export const maxDuration = 60

const FixPushRequestSchema = z.object({
  repoUrl: z.string().url('repoUrl must be a valid URL'),
  filePath: z.string().min(1, 'filePath is required'),
  originalCode: z.string().min(1, 'originalCode is required'),
  fixedCode: z.string().min(1, 'fixedCode is required'),
  vulnerabilityId: z.string().min(1, 'vulnerabilityId is required'),
  // Optional vulnerability metadata for rich PR body
  vulnTitle: z.string().optional(),
  vulnSeverity: z.string().optional(),
  vulnDescription: z.string().optional(),
  vulnLineNumber: z.number().optional(),
  fixExplanation: z.string().optional(),
})

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON in request body' }, { status: 400 })
  }

  const parsed = FixPushRequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 400 }
    )
  }

  const { repoUrl, filePath, originalCode, fixedCode, vulnerabilityId } = parsed.data

  // Use the authenticated user's GitHub token for PR creation
  const session = await auth()
  const githubToken = session?.accessToken

  try {
    // Fetch the full current file to apply the fix in context
    const currentContent = await getFileContent(repoUrl, filePath, githubToken)

    // Replace the original vulnerable snippet with the fixed code
    if (!currentContent.includes(originalCode)) {
      return Response.json(
        { error: 'Original code snippet not found in the current file — the file may have changed since the scan.' },
        { status: 409 }
      )
    }

    const newContent = currentContent.replace(originalCode, fixedCode)

    // Build vulnerability metadata for rich PR body
    const vulnMeta: PRVulnMeta | undefined =
      parsed.data.vulnTitle
        ? {
            title: parsed.data.vulnTitle,
            severity: parsed.data.vulnSeverity ?? 'UNKNOWN',
            description: parsed.data.vulnDescription ?? '',
            lineNumber: parsed.data.vulnLineNumber,
            explanation: parsed.data.fixExplanation ?? '',
          }
        : undefined

    const prUrl = await openPR(repoUrl, filePath, newContent, vulnerabilityId, githubToken, vulnMeta)

    const responseBody: FixPushResponse = { prUrl }
    return Response.json(responseBody)

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[POST /api/fix/push] Error: ${message}`)
    return Response.json({ error: message }, { status: 500 })
  }
}
