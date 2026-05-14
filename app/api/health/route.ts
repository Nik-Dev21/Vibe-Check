/**
 * GET /api/health
 * Pings core services concurrently and returns per-service status.
 * Always returns HTTP 200 — callers check the `status` field.
 */

import { pingCOS } from '@/lib/ibm/cos'
import { pingCloudant } from '@/lib/ibm/cloudant'
import { pingFeatherless } from '@/lib/featherless'
import { pingClaude } from '@/lib/claude'

type ServiceStatus = 'ok' | 'error'

interface HealthResponse {
  status: 'ok' | 'degraded'
  services: {
    claude: ServiceStatus
    cos: ServiceStatus
    cloudant: ServiceStatus
    featherless: ServiceStatus
  }
  errors: Record<string, string>
}

export async function GET(): Promise<Response> {
  const checks: Array<{ name: keyof HealthResponse['services']; fn: () => Promise<void> }> = [
    { name: 'claude', fn: pingClaude },
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
