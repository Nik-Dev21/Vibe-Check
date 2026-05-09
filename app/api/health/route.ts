/**
 * GET /api/health
 * Pings all 6 services concurrently and returns per-service status.
 * Always returns HTTP 200 — callers check the `status` field.
 */

import { getIBMToken } from '@/lib/ibm/iam'
import { pingCOS } from '@/lib/ibm/cos'
import { pingCloudant } from '@/lib/ibm/cloudant'
import { pingFeatherless } from '@/lib/featherless'

// NLU and watsonx are tested implicitly via IAM token + a lightweight fetch
async function pingWatsonx(): Promise<void> {
  const token = await getIBMToken()
  const baseUrl = process.env.WATSONX_URL
  if (!baseUrl) throw new Error('WATSONX_URL is not set')
  // Call the foundation models list — cheapest read endpoint
  const res = await fetch(
    `${baseUrl}/ml/v1/foundation_model_specs?version=2023-05-29&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

async function pingNLU(): Promise<void> {
  const apiKey = process.env.WATSON_NLU_API_KEY
  const serviceUrl = process.env.WATSON_NLU_URL
  if (!apiKey) throw new Error('WATSON_NLU_API_KEY is not set')
  if (!serviceUrl) throw new Error('WATSON_NLU_URL is not set')
  // Call the root endpoint — returns service version info
  const credentials = Buffer.from(`apikey:${apiKey}`).toString('base64')
  const res = await fetch(serviceUrl, {
    headers: { Authorization: `Basic ${credentials}` },
  })
  // NLU returns 200 or 404 on the root; either means it's reachable
  if (res.status >= 500) throw new Error(`HTTP ${res.status}`)
}

type ServiceStatus = 'ok' | 'error'

interface HealthResponse {
  status: 'ok' | 'degraded'
  services: {
    iam: ServiceStatus
    watsonx: ServiceStatus
    nlu: ServiceStatus
    cos: ServiceStatus
    cloudant: ServiceStatus
    featherless: ServiceStatus
  }
  errors: Record<string, string>
}

export async function GET(): Promise<Response> {
  const checks: Array<{ name: keyof HealthResponse['services']; fn: () => Promise<void> }> = [
    { name: 'iam', fn: async () => { await getIBMToken() } },
    { name: 'watsonx', fn: pingWatsonx },
    { name: 'nlu', fn: pingNLU },
    { name: 'cos', fn: pingCOS },
    { name: 'cloudant', fn: pingCloudant },
    { name: 'featherless', fn: pingFeatherless },
  ]

  const results = await Promise.allSettled(checks.map((c) => c.fn()))

  const services = {} as HealthResponse['services']
  const errors: Record<string, string> = {}

  for (let i = 0; i < checks.length; i++) {
    const name = checks[i].name
    const result = results[i]
    if (result.status === 'fulfilled') {
      services[name] = 'ok'
    } else {
      services[name] = 'error'
      errors[name] = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason)
    }
  }

  const allOk = Object.values(services).every((s) => s === 'ok')

  const body: HealthResponse = {
    status: allOk ? 'ok' : 'degraded',
    services,
    errors,
  }

  return Response.json(body)
}
