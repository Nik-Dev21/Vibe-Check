/**
 * POST /api/fix/bulk
 * Generates fixes for multiple vulnerabilities and opens a single PR.
 * Returns per-file diff details for the UI to show a changes menu.
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
  category: z.string().optional(),
})

const BulkFixRequestSchema = z.object({
  repoUrl: z.string().url(),
  vulnerabilities: z.array(BulkFixItemSchema).min(1).max(20),
})

export interface BulkFixResult {
  filePath: string
  vulnTitle: string
  severity: string
  original: string
  fixed: string
  explanation: string
  status: 'patched' | 'skipped'
  skipReason?: string
}

export interface BulkFixResponse {
  prUrl: string
  fixedCount: number
  skippedCount: number
  results: BulkFixResult[]
}

/**
 * Find and replace a snippet in file content, tolerating minor whitespace/quote differences.
 * Returns null if no match can be found even with fuzzy matching.
 */
function applySnippetFix(fileContent: string, original: string, fixed: string): string | null {
  // 1. Exact match
  if (fileContent.includes(original)) {
    return fileContent.replace(original, fixed)
  }

  // 2. Normalize whitespace: collapse runs of spaces/tabs to a single space,
  //    then try matching the normalized snippet against normalized content.
  const normalize = (s: string) =>
    s.replace(/[ \t]+/g, ' ').replace(/\r\n/g, '\n').trim()

  const normContent = normalize(fileContent)
  const normOriginal = normalize(original)

  if (normContent.includes(normOriginal)) {
    // Re-apply on the un-normalized content by finding the approximate location
    // and replacing it line-by-line
    const origLines = original.split('\n')
    const contentLines = fileContent.split('\n')

    // Find the first line of the snippet in the file (fuzzy)
    const firstLineNorm = normalize(origLines[0])
    const startIdx = contentLines.findIndex(
      (l) => normalize(l) === firstLineNorm
    )

    if (startIdx !== -1 && origLines.length > 0) {
      const endIdx = startIdx + origLines.length
      const extracted = contentLines.slice(startIdx, endIdx).join('\n')

      // Replace the extracted block with the fixed code, preserving surrounding content
      const before = contentLines.slice(0, startIdx).join('\n')
      const after = contentLines.slice(endIdx).join('\n')
      const joined = [before, fixed, after].filter((p) => p !== '').join('\n')
      return joined
    }
  }

  return null
}

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
    const results: BulkFixResult[] = []

    for (const vuln of vulnerabilities) {
      let fixResult: BulkFixResult = {
        filePath: vuln.filePath,
        vulnTitle: vuln.title,
        severity: vuln.severity,
        original: vuln.codeSnippet,
        fixed: '',
        explanation: '',
        status: 'skipped',
      }

      try {
        const vulnerability = buildVulnerabilityFromFixRequest({
          vulnerabilityId: vuln.vulnerabilityId,
          filePath: vuln.filePath,
          codeSnippet: vuln.codeSnippet,
        })

        const fix = await generateFix(vulnerability, vuln.codeSnippet)

        const currentContent = await getFileContent(repoUrl, vuln.filePath, githubToken)
        const newContent = applySnippetFix(currentContent, fix.original, fix.fixed)

        if (newContent === null) {
          console.warn(`[bulk-fix] Snippet not found in ${vuln.filePath} (exact or fuzzy), skipping`)
          fixResult.skipReason = 'Snippet not found in current file — file may have changed since scan.'
        } else if (newContent === currentContent) {
          console.warn(`[bulk-fix] Fix produced no change in ${vuln.filePath}, skipping`)
          fixResult.skipReason = 'Fix produced no change in file content.'
        } else {
          fixes.push({
            filePath: vuln.filePath,
            newContent,
            vulnTitle: vuln.title,
            severity: vuln.severity,
          })
          fixResult = {
            ...fixResult,
            original: fix.original,
            fixed: fix.fixed,
            explanation: fix.explanation,
            status: 'patched',
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[bulk-fix] Fix generation failed for ${vuln.filePath}: ${msg}`)
        fixResult.skipReason = `Fix generation failed: ${msg}`
      }

      results.push(fixResult)
    }

    if (fixes.length === 0) {
      return Response.json(
        {
          error: 'No fixes could be applied — snippets may not match the current file state.',
          results,
        },
        { status: 409 }
      )
    }

    const prUrl = await openBulkPR(repoUrl, fixes, githubToken)
    const skippedCount = results.filter((r) => r.status === 'skipped').length

    const responseBody: BulkFixResponse = {
      prUrl,
      fixedCount: fixes.length,
      skippedCount,
      results,
    }

    return Response.json(responseBody)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[POST /api/fix/bulk] Error: ${message}`)
    return Response.json({ error: message }, { status: 500 })
  }
}
