/**
 * lib/ibm/cos.ts
 * IBM Cloud Object Storage client.
 * Reads: IBM_COS_API_KEY, IBM_COS_INSTANCE_CRN, IBM_COS_ENDPOINT, IBM_COS_BUCKET_NAME
 * Stores full ScanReport JSON as {scanId}.json
 */

import * as S3 from 'ibm-cos-sdk'
import type { ScanReport } from '../types'

let cosClient: S3.S3 | null = null

function getCOSClient(): S3.S3 {
  if (cosClient) return cosClient

  const apiKeyId = process.env.IBM_COS_API_KEY
  const serviceInstanceId = process.env.IBM_COS_INSTANCE_CRN
  const endpoint = process.env.IBM_COS_ENDPOINT

  if (!apiKeyId) throw new Error('[COS] IBM_COS_API_KEY is not set')
  if (!serviceInstanceId) throw new Error('[COS] IBM_COS_INSTANCE_CRN is not set')
  if (!endpoint) throw new Error('[COS] IBM_COS_ENDPOINT is not set')

  cosClient = new S3.S3({
    ibmAuthEndpoint: 'https://iam.cloud.ibm.com/identity/token',
    apiKeyId,
    serviceInstanceId,
    endpoint,
  })

  return cosClient
}

function getBucket(): string {
  const bucket = process.env.IBM_COS_BUCKET_NAME
  if (!bucket) throw new Error('[COS] IBM_COS_BUCKET_NAME is not set')
  return bucket
}

/**
 * Upload the full ScanReport as JSON to COS.
 * Returns the object key (`{scanId}.json`).
 */
export async function saveReport(scanId: string, report: ScanReport): Promise<string> {
  const client = getCOSClient()
  const bucket = getBucket()
  const key = `${scanId}.json`

  await client.putObject({
    Bucket: bucket,
    Key: key,
    Body: JSON.stringify(report),
    ContentType: 'application/json',
  }).promise()

  return key
}

/**
 * Download and parse a ScanReport from COS by scanId.
 * Returns null if the object does not exist.
 */
export async function getReport(scanId: string): Promise<ScanReport | null> {
  const client = getCOSClient()
  const bucket = getBucket()
  const key = `${scanId}.json`

  try {
    const obj = await client.getObject({ Bucket: bucket, Key: key }).promise()
    const body = obj.Body?.toString('utf-8')
    if (!body) return null
    return JSON.parse(body) as ScanReport
  } catch (err: unknown) {
    // NoSuchKey — object doesn't exist yet
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException & { code?: string }).code === 'NoSuchKey'
    ) {
      return null
    }
    throw err
  }
}

/**
 * Lightweight check that COS is reachable.
 * Lists objects with max 1 result — only verifies credentials + bucket access.
 */
export async function pingCOS(): Promise<void> {
  const client = getCOSClient()
  const bucket = getBucket()
  await client.listObjectsV2({ Bucket: bucket, MaxKeys: 1 }).promise()
}
