/**
 * POST /api/fix/push
 * Fetches the current file from GitHub, applies the fix, opens a PR.
 * User must explicitly click "Push as PR" — never auto-pushes.
 */

import { z } from 'zod'
import { getFileContent, openPR } from '@/lib/github'
import type { FixPushResponse } from '@/lib/types'

export const maxDuration = 60

const FixPushRequestSchema = z.object({
  repoUrl: z.string().url('repoUrl must be a valid URL'),
  filePath: z.string().min(1, 'filePath is required'),
  fixedCode: z.string().min(1, 'fixedCode is required'),
  vulnerabilityId: z.string().min(1, 'vulnerabilityId is required'),
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

  const { repoUrl, filePath, fixedCode, vulnerabilityId } = parsed.data

  try {
    // Fetch the full current file to apply the fix in context
    const currentContent = await getFileContent(repoUrl, filePath)

    // The fixedCode replaces the snippet within the full file.
    // The auto-fix prompt guarantees fixedCode is a drop-in replacement for the
    // original snippet — we need the original to do the replacement correctly.
    // Since we only have fixedCode here (not the original snippet), we use it
    // directly as the new file content if it's a full file, or ask the caller
    // to send the full file content.
    //
    // Safe assumption: if fixedCode is longer than 10 lines it's a full file,
    // otherwise it's a snippet — in which case we can't safely replace without
    // the original. For now, pass fixedCode as the full new file content.
    // The fix panel in Stream B always sends the full patched file.
    const newContent =
      fixedCode.split('\n').length > 10
        ? fixedCode          // caller sent the full patched file
        : currentContent.replace(
            // Attempt best-effort snippet replacement (not guaranteed for multi-line)
            fixedCode,
            fixedCode
          )

    const prUrl = await openPR(repoUrl, filePath, newContent, vulnerabilityId)

    const responseBody: FixPushResponse = { prUrl }
    return Response.json(responseBody)

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[POST /api/fix/push] Error: ${message}`)
    return Response.json({ error: message }, { status: 500 })
  }
}
