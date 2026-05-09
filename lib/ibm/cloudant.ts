/**
 * lib/ibm/cloudant.ts
 * IBM Cloudant client.
 * Reads: IBM_CLOUDANT_URL, IBM_CLOUDANT_API_KEY, IBM_CLOUDANT_DB_NAME
 * Stores lightweight scan summaries and scan status docs.
 */

import { CloudantV1 } from '@ibm-cloud/cloudant'
import { IamAuthenticator } from 'ibm-cloud-sdk-core'
import type { ScanReport, ScanStatus } from '../types'

let cloudantClient: CloudantV1 | null = null

function getClient(): CloudantV1 {
  if (cloudantClient) return cloudantClient

  const url = process.env.IBM_CLOUDANT_URL
  const apiKey = process.env.IBM_CLOUDANT_API_KEY

  if (!url) throw new Error('[Cloudant] IBM_CLOUDANT_URL is not set')
  if (!apiKey) throw new Error('[Cloudant] IBM_CLOUDANT_API_KEY is not set')

  cloudantClient = CloudantV1.newInstance({
    authenticator: new IamAuthenticator({ apikey: apiKey }),
    serviceUrl: url,
  })

  return cloudantClient
}

function getDbName(): string {
  const db = process.env.IBM_CLOUDANT_DB_NAME
  if (!db) throw new Error('[Cloudant] IBM_CLOUDANT_DB_NAME is not set')
  return db
}

// ── Status documents ──────────────────────────────────────────────────────────

/**
 * Write a ScanStatus doc to Cloudant. Used during active scans.
 * If a doc already exists, it is updated (rev fetched internally).
 */
export async function updateScanStatus(status: ScanStatus): Promise<void> {
  const client = getClient()
  const db = getDbName()

  // Try to get existing rev to allow an update
  let rev: string | undefined
  try {
    const existing = await client.getDocument({ db, docId: status.scanId })
    rev = existing.result._rev
  } catch {
    // Doc doesn't exist yet — will create
  }

  const doc: Record<string, unknown> = {
    _id: status.scanId,
    type: 'status',
    ...status,
    updatedAt: new Date().toISOString(),
  }
  if (rev) doc._rev = rev

  await client.putDocument({ db, docId: status.scanId, document: doc })
}

/**
 * Save a completed ScanReport summary to Cloudant.
 * Excludes file contents — only metadata and findings.
 */
export async function saveScanSummary(report: ScanReport): Promise<void> {
  const client = getClient()
  const db = getDbName()

  // Get rev if doc exists (idempotent upsert)
  let rev: string | undefined
  try {
    const existing = await client.getDocument({ db, docId: report.scanId })
    rev = existing.result._rev
  } catch {
    // New document
  }

  const doc: Record<string, unknown> = {
    _id: report.scanId,
    type: 'report',
    ...report,
    updatedAt: new Date().toISOString(),
  }
  if (rev) doc._rev = rev

  await client.putDocument({ db, docId: report.scanId, document: doc })
}

/**
 * Fetch a scan document from Cloudant.
 * Returns a ScanStatus if the scan is still in progress,
 * or a ScanReport if it's complete, or null if not found.
 */
export async function getScan(
  scanId: string
): Promise<ScanReport | ScanStatus | null> {
  const client = getClient()
  const db = getDbName()

  try {
    const res = await client.getDocument({ db, docId: scanId })
    const doc = res.result as Record<string, unknown>

    if (doc.type === 'status') {
      const { type: _type, _id, _rev, updatedAt: _u, ...rest } = doc
      void _type; void _id; void _rev; void _u
      return rest as unknown as ScanStatus
    }

    if (doc.type === 'report') {
      const { type: _type, _id, _rev, updatedAt: _u, ...rest } = doc
      void _type; void _id; void _rev; void _u
      return rest as unknown as ScanReport
    }

    return null
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException & { status?: number }).status === 404
    ) {
      return null
    }
    throw err
  }
}

/**
 * Lightweight health check — verifies DB is reachable.
 */
export async function pingCloudant(): Promise<void> {
  const client = getClient()
  const db = getDbName()
  await client.getDatabaseInformation({ db })
}
