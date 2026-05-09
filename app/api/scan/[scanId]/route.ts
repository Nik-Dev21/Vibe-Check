/**
 * GET /api/scan/[scanId]
 * Returns the ScanReport (if complete) or ScanStatus (if in progress/error).
 * Stream B polls this every 2s during the loading.tsx phase.
 */

import { getScan } from '@/lib/ibm/cloudant'
import { getReport } from '@/lib/ibm/cos'
import type { ScanStatus } from '@/lib/types'

function isScanStatus(doc: unknown): doc is ScanStatus {
  return (
    typeof doc === 'object' &&
    doc !== null &&
    'status' in doc &&
    ((doc as ScanStatus).status === 'scanning' ||
      (doc as ScanStatus).status === 'error')
  )
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ scanId: string }> }
): Promise<Response> {
  const { scanId } = await params

  if (!scanId) {
    return Response.json({ error: 'scanId is required' }, { status: 400 })
  }

  try {
    const doc = await getScan(scanId)

    if (!doc) {
      return Response.json({ error: 'Scan not found' }, { status: 404 })
    }

    // If the scan is still in progress or errored, return the ScanStatus doc
    if (isScanStatus(doc)) {
      return Response.json(doc)
    }

    // Scan is complete — check COS for the full report first
    // (Cloudant stores the summary; COS has the full vulnerabilities list)
    const fullReport = await getReport(scanId)

    if (fullReport) {
      return Response.json(fullReport)
    }

    // COS report not found — fall back to the Cloudant summary
    return Response.json(doc)

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[GET /api/scan/${scanId}] Error: ${message}`)
    return Response.json({ error: 'Failed to retrieve scan' }, { status: 500 })
  }
}
