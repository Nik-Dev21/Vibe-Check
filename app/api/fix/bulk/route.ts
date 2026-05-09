/**
 * POST /api/fix/bulk
 * Generates fixes for multiple vulnerabilities and opens a single PR.
 * Used by the "Fix All Critical" feature.
 */

import { z } from 'zod'
import { auth } from '@/lib/auth'
import { generateFix, buildVulnerabilityFromFixRequest } from '@/lib/scanner/auto-fix'
import { getFileContent, openBulkPR, type BulkFixFile } from '@/lib/github'

export const maxDuration = 120

const BulkFixItemSchema = z.object({
  vulnerabilityId: z.string().min(1),
  filePath: z.string().min(1),
  codeSnippet: z.string().min(1),
  title: z.string(),
  severity: z.string(),
})

const BulkFixRequestSchema = z.object({
  repoUrl: z.string().url(),
  vulnerabilities: z.array(BulkFixItemSchema).min(1).max(20),
})

export async function POST(request: Request): Promise<Response> {
  const session = await auth()
  const githubToken = session?.accessToken

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = BulkFixRequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 400 }
    )
  }

  const { repoUrl, vulnerabilities } = parsed.data

  try {
    const fixes: BulkFixFile[] = []

    // Generate fixes sequentially to avoid overwhelming watsonx.ai
    for (const vuln of vulnerabilities) {
      const vulnerability = buildVulnerabilityFromFixRequest({
        vulnerabilityId: vuln.vulnerabilityId,
        filePath: vuln.filePath,
        codeSnippet: vuln.codeSnippet,
      })

      const fix = await generateFix(vulnerability, vuln.codeSnippet)

      // Fetch current file and apply the fix
      const currentContent = await getFileContent(repoUrl, vuln.filePath, githubToken)
      if (!currentContent.includes(fix.original)) {
        console.warn(`[bulk-fix] Original snippet not found in ${vuln.filePath}, skipping`)
        continue
      }

      const newContent = currentContent.replace(fix.original, fix.fixed)
      fixes.push({
        filePath: vuln.filePath,
        newContent,
        vulnTitle: vuln.title,
        severity: vuln.severity,
      })
    }

    if (fixes.length === 0) {
      return Response.json(
        { error: 'No fixes could be generated — file contents may have changed.' },
        { status: 409 }
      )
    }

    const prUrl = await openBulkPR(repoUrl, fixes, githubToken)

    return Response.json({ prUrl, fixedCount: fixes.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[POST /api/fix/bulk] Error: ${message}`)
    return Response.json({ error: message }, { status: 500 })
  }
}
