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

  // ── Write initial status so /loading can poll immediately ────────────────
  try {
    await updateScanStatus({
      scanId,
      status: 'scanning',
      phase: 'fetching',
      progress: 0,
    })
  } catch (err) {
    console.warn(`[POST /api/scan] Initial status write failed: ${
      err instanceof Error ? err.message : String(err)
    }`)
  }

  // ── Respond immediately so the client can navigate to /loading ────────────
  // Pipeline runs in the background — Vercel waitUntil keeps the function alive.
  const responseBody: ScanResponse = { scanId, status: 'queued' }

  async function runPipeline() {
    try {
      const report = await runScanPipeline(repoUrl, scanId, githubToken)
      const reportKey = await saveReport(scanId, report)
      await saveScanSummary({
        ...report,
        reportUrl: `cos://${process.env.IBM_COS_BUCKET_NAME}/${reportKey}`,
      })
      await updateScanStatus({
        scanId,
        status: 'complete',
        phase: 'storing',
        progress: 100,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[POST /api/scan] Pipeline error for ${repoUrl}: ${message}`)
      try {
        await updateScanStatus({
          scanId,
          status: 'error',
          phase: 'fetching',
          progress: 0,
          error: message,
        })
      } catch { /* best-effort */ }
    }
  }

  // Detach pipeline from the request handler so the response returns immediately.
  // setImmediate pushes work after the current call stack (including response send).
  // On Vercel, waitUntil keeps the function alive past response flush.
  const ctx = globalThis as Record<string, unknown>
  if (typeof ctx['__vercel_waitUntil__'] === 'function') {
    ;(ctx['__vercel_waitUntil__'] as (p: Promise<unknown>) => void)(runPipeline())
  } else {
    setImmediate(() => { void runPipeline() })
  }

  return Response.json(responseBody, { status: 201 })
}
