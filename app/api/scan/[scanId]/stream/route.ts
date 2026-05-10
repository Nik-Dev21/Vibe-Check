/**
 * GET /api/scan/[scanId]/stream
 * Server-Sent Events endpoint. Polls Cloudant every 1.5s and emits events as
 * new findings or phase changes appear.
 *
 * Event types:
 *   file_complete     — a file finished scanning (Featherless phase)
 *   phase_update      — phase/progress changed
 *   partial_complete  — Featherless scan done, partial report ready
 *   enrich_update     — watsonx added new findings to a file
 *   scan_complete     — all enrichment done, final report locked
 *   error             — scan failed
 */

import { getScan } from '@/lib/ibm/cloudant'
import { getReport } from '@/lib/ibm/cos'
import type { ScanStatus, Vulnerability } from '@/lib/types'

export const maxDuration = 120

// ── SSE helpers ───────────────────────────────────────────────────────────────

function encode(data: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ scanId: string }> }
): Promise<Response> {
  const { scanId } = await params

  const stream = new ReadableStream({
    async start(controller) {
      // Track what we've already emitted so we only push deltas
      const emittedFilePaths = new Set<string>()
      const emittedEnrichedPaths = new Set<string>()
      let lastPhase = ''
      let lastProgress = -1
      let partialEmitted = false
      const startedAt = Date.now()
      const TIMEOUT_MS = 115_000 // just under maxDuration

      const enqueue = (data: unknown) => {
        try {
          controller.enqueue(encode(data))
        } catch {
          // Stream already closed
        }
      }

      const close = () => {
        try { controller.close() } catch { /* already closed */ }
      }

      try {
        while (true) {
          // Respect client disconnect
          if (request.signal.aborted) {
            close()
            return
          }

          // Global timeout
          if (Date.now() - startedAt > TIMEOUT_MS) {
            enqueue({ type: 'error', message: 'Scan timeout — try again.' })
            close()
            return
          }

          // Fetch current scan doc from Cloudant
          let doc: Awaited<ReturnType<typeof getScan>>
          try {
            doc = await getScan(scanId)
          } catch {
            await sleep(2000)
            continue
          }

          if (!doc) {
            await sleep(1500)
            continue
          }

          const isStatus = 'status' in doc
          const status = isStatus ? (doc as ScanStatus).status : 'complete'
          const phase = isStatus ? (doc as ScanStatus).phase : 'storing'
          const progress = isStatus ? (doc as ScanStatus).progress : 100
          const raw = doc as unknown as Record<string, unknown>

          // Emit phase_update on any change
          if (phase !== lastPhase || progress !== lastProgress) {
            enqueue({ type: 'phase_update', phase, progress })
            lastPhase = phase
            lastProgress = progress
          }

          // Emit file_complete for newly scanned files (Featherless phase)
          const scannedFiles = (raw.scannedFiles as Array<{ path: string; riskLevel: string }> | undefined) ?? []
          for (const sf of scannedFiles) {
            if (!emittedFilePaths.has(sf.path)) {
              emittedFilePaths.add(sf.path)
              // Extract findings for this specific file from partialFindings
              const partialFindings = (raw.partialFindings as Vulnerability[] | undefined) ?? []
              const fileFindings = partialFindings.filter((v) => v.filePath === sf.path)
              enqueue({
                type: 'file_complete',
                filePath: sf.path,
                riskLevel: sf.riskLevel,
                findings: fileFindings,
              })
            }
          }

          // Emit enrich_update for newly enriched files (watsonx phase)
          const enrichedFindings = (raw.enrichedFindings as Vulnerability[] | undefined) ?? []
          const enrichedByFile = new Map<string, Vulnerability[]>()
          for (const v of enrichedFindings) {
            const arr = enrichedByFile.get(v.filePath) ?? []
            arr.push(v)
            enrichedByFile.set(v.filePath, arr)
          }
          for (const [filePath, findings] of enrichedByFile) {
            if (!emittedEnrichedPaths.has(filePath)) {
              emittedEnrichedPaths.add(filePath)
              enqueue({ type: 'enrich_update', filePath, additionalFindings: findings })
            }
          }

          // Emit partial_complete once Featherless scan is done (storing phase reached)
          if (!partialEmitted && (phase === 'storing' || status === 'complete')) {
            partialEmitted = true
            // Try to get full report from COS, fall back to Cloudant doc
            let report: unknown = null
            try {
              report = await getReport(scanId)
            } catch { /* fall through */ }
            if (!report) report = doc

            const enrichingFiles = (raw.enrichingFiles as string[] | undefined) ?? []
            enqueue({
              type: 'partial_complete',
              report,
              enriching: enrichingFiles.length > 0 || status !== 'complete',
            })
          }

          // Emit scan_complete and close when fully done
          if (status === 'complete') {
            let finalReport: unknown = null
            try {
              finalReport = await getReport(scanId)
            } catch { /* fall through */ }
            if (!finalReport) finalReport = doc

            // Merge in any enriched findings
            if (finalReport && typeof finalReport === 'object') {
              const fr = finalReport as Record<string, unknown>
              const base = (fr.vulnerabilities as Vulnerability[] | undefined) ?? []
              const enriched = enrichedFindings
              if (enriched.length > 0) {
                const merged = deduplicateById([...base, ...enriched])
                  .sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity))
                fr.vulnerabilities = merged
              }
            }

            enqueue({ type: 'scan_complete', report: finalReport })
            close()
            return
          }

          if (status === 'error') {
            const errMsg = (raw.error as string | undefined) ?? 'Scan failed'
            enqueue({ type: 'error', message: errMsg })
            close()
            return
          }

          await sleep(1500)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        enqueue({ type: 'error', message: msg })
        close()
      }
    },

    cancel() {
      // Client disconnected — nothing to clean up since scan runs independently
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // disable Nginx buffering
    },
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEV_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']

function deduplicateById(vulns: Vulnerability[]): Vulnerability[] {
  const seen = new Set<string>()
  return vulns.filter((v) => {
    const key = `${v.filePath}:${v.lineNumber ?? 'x'}:${v.category}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
