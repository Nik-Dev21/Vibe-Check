/**
 * POST /api/scan
 * Accepts a GitHub repo URL, runs the Claude scan pipeline, stores the report,
 * then optionally kicks off a Featherless second-opinion pass via waitUntil.
 * Returns { scanId, status: 'queued' } immediately.
 *
 * Timeline:
 *   ~0s   → response returned, client navigates to /loading
 *   ~10s  → report stored, user sees results via SSE stream
 *   ~25s  → Featherless second-opinion completes (optional), SSE emits scan_complete
 */

import { waitUntil } from '@vercel/functions'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { runScanPipeline, enrichWithFeatherless, generateScanId } from '@/lib/scanner/index'
import { saveReport } from '@/lib/ibm/cos'
import { saveScanSummary, updateScanStatus } from '@/lib/ibm/cloudant'
import type { ScanResponse } from '@/lib/types'

export const maxDuration = 60

const ScanRequestSchema = z.object({
  repoUrl: z.string().min(1).refine((v) => {
    try { new URL(v); return true } catch { return false }
  }, 'repoUrl must be a valid URL'),
})

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON in request body' }, { status: 400 })
  }

  const parsed = ScanRequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 400 }
    )
  }

  const { repoUrl } = parsed.data
  const scanId = generateScanId()

  const session = await auth()
  const githubToken = session?.accessToken

  // Write initial status so /loading can poll immediately
  try {
    await updateScanStatus({ scanId, status: 'scanning', phase: 'fetching', progress: 0, repoUrl })
  } catch (err) {
    console.warn(`[POST /api/scan] Initial status write failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  const responseBody: ScanResponse = { scanId, status: 'queued' }

  async function runPipeline() {
    try {
      // Phase 1–4: Claude-driven scan
      const { report, topHighFiles } = await runScanPipeline(repoUrl, scanId, githubToken)

      // Store partial report — user sees this via SSE partial_complete
      const reportKey = await saveReport(scanId, report)
      await saveScanSummary({
        ...report,
        reportUrl: `cos://${process.env.IBM_COS_BUCKET_NAME}/${reportKey}`,
      })
      await updateScanStatus({
        scanId,
        status: 'scanning',
        phase: 'storing',
        progress: 93,
        repoUrl,
        partialFindings: report.vulnerabilities,
        enrichingFiles: topHighFiles.map((f) => f.filePath),
      } as Parameters<typeof updateScanStatus>[0])

      // Optional Featherless second-opinion in background — adds more findings
      // for HIGH-risk files. Skipped (and scan marked complete immediately) if
      // there are no HIGH files or Featherless is not configured.
      const featherlessOn = !!process.env.FEATHERLESS_API_KEY
      if (featherlessOn && topHighFiles.length > 0) {
        waitUntil(enrichWithFeatherless(scanId, repoUrl, topHighFiles))
      } else {
        await updateScanStatus({ scanId, status: 'complete', phase: 'storing', progress: 100, repoUrl })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[POST /api/scan] Pipeline error for ${repoUrl}: ${message}`)
      try {
        await updateScanStatus({ scanId, status: 'error', phase: 'fetching', progress: 0, error: message, repoUrl })
      } catch { /* best-effort */ }
    }
  }

  // Detach pipeline — waitUntil keeps the Vercel function alive past response flush
  waitUntil(runPipeline())

  return Response.json(responseBody, { status: 201 })
}
