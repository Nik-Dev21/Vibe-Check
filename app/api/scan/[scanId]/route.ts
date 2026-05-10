/**
 * GET /api/scan/[scanId]
 * Returns the ScanReport (if complete) or ScanStatus (if in progress/error).
 * Stream B polls this every 2s during the loading.tsx phase.
 */

import { getScan } from '@/lib/ibm/cloudant'
import { getReport } from '@/lib/ibm/cos'
import type { ScanStatus } from '@/lib/types'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ scanId: string }> }
): Promise<Response> {
  const { scanId } = await params

  if (!scanId) {
    return Response.json({ error: 'scanId is required' }, { status: 400 })
  }

  const url = new URL(req.url)
  const full = url.searchParams.get('full') === '1'

  try {
    const doc = await getScan(scanId)

    if (!doc) {
      return Response.json({ error: 'Scan not found' }, { status: 404 })
    }

    // Status doc (scanning/error) — return as-is so poller can track progress
    if ('status' in doc && (doc as ScanStatus).status !== 'complete') {
      return Response.json(doc)
    }

    // Scan complete — unless ?full=1 is requested, return a lightweight status
    // so the loading page redirect happens immediately without waiting for COS.
    if (!full) {
      return Response.json({ status: 'complete', scanId })
    }

    // Full report requested (results page) — fetch from COS then fall back to Cloudant
    const fullReport = await getReport(scanId)
    return Response.json(fullReport ?? doc)

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[GET /api/scan/${scanId}] Error: ${message}`)
    return Response.json({ error: 'Failed to retrieve scan' }, { status: 500 })
  }
}
