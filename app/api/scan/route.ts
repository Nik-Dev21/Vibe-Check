/**
 * POST /api/scan
 * Accepts a GitHub repo URL, runs the full scan pipeline, persists results.
 * Returns { scanId, status: 'queued' } immediately while pipeline runs.
 *
 * Pipeline runs synchronously within the serverless function.
 * Vercel timeout: 60s (set via maxDuration).
 */

import { z } from 'zod'
import { auth } from '@/lib/auth'
import { runScanPipeline, generateScanId } from '@/lib/scanner/index'
import { saveReport } from '@/lib/ibm/cos'
import { saveScanSummary, updateScanStatus } from '@/lib/ibm/cloudant'
import type { ScanResponse } from '@/lib/types'

export const maxDuration = 60

const ScanRequestSchema = z.object({
  repoUrl: z.string().url('repoUrl must be a valid URL'),
})

export async function POST(request: Request): Promise<Response> {
  // ── Parse and validate request body ────────────────────────────────────────
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 }
    )
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

  // Use the authenticated user's GitHub token if available (for private repos)
  const session = await auth()
  const githubToken = session?.accessToken

  // ── Write initial status to Cloudant (scan is starting) ───────────────────
  try {
    await updateScanStatus({
      scanId,
      status: 'scanning',
      phase: 'fetching',
      progress: 0,
    })
  } catch (err) {
    // Non-fatal — proceed with scan even if Cloudant is temporarily unavailable
    console.warn(`[POST /api/scan] Initial status write failed: ${
      err instanceof Error ? err.message : String(err)
    }`)
  }

  // ── Run the full scan pipeline ─────────────────────────────────────────────
  try {
    const report = await runScanPipeline(repoUrl, scanId, githubToken)

    // Persist full report to COS
    const reportKey = await saveReport(scanId, report)

    // Persist summary to Cloudant (with COS URL for reference)
    await saveScanSummary({
      ...report,
      reportUrl: `cos://${process.env.IBM_COS_BUCKET_NAME}/${reportKey}`,
    })

    // Mark as complete in Cloudant
    await updateScanStatus({
      scanId,
      status: 'complete',
      phase: 'storing',
      progress: 100,
    })

    const responseBody: ScanResponse = { scanId, status: 'queued' }
    return Response.json(responseBody, { status: 201 })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[POST /api/scan] Pipeline error for ${repoUrl}: ${message}`)

    // Write error status to Cloudant so /api/scan/[scanId] can surface it
    try {
      await updateScanStatus({
        scanId,
        status: 'error',
        phase: 'fetching',
        progress: 0,
        error: message,
      })
    } catch {
      // Best-effort — don't mask the original error
    }

    return Response.json({ error: message }, { status: 500 })
  }
}
