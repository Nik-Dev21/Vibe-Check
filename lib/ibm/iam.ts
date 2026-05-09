/**
 * lib/ibm/iam.ts
 * IBM IAM token fetcher with module-level in-memory caching.
 * Reads: IBM_IAM_TOKEN_URL, WATSONX_API_KEY
 * Never logs the API key or token — varlock compliant.
 */

interface TokenCache {
  token: string
  expiresAt: number // epoch ms
}

// Module-level cache — survives across requests in a warm serverless instance
let cachedToken: TokenCache | null = null

/**
 * Returns a valid IBM IAM Bearer token.
 * Re-fetches automatically when the token is within 60s of expiry.
 */
export async function getIBMToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token
  }

  const iamUrl = process.env.IBM_IAM_TOKEN_URL
  if (!iamUrl) {
    throw new Error('[IAM] IBM_IAM_TOKEN_URL is not set')
  }

  // Gather standard platform API keys that are in the environment.
  // Standard SaaS IAM exchange fails for CPD keys (cpd-apikey-...).
  // We prioritize valid SaaS platform API keys first.
  const candidates: string[] = []

  const watsonxKey = process.env.WATSONX_API_KEY
  if (watsonxKey && !watsonxKey.startsWith('cpd-')) {
    candidates.push(watsonxKey)
  }

  const cosKey = process.env.IBM_COS_API_KEY
  if (cosKey) candidates.push(cosKey)

  const cloudantKey = process.env.IBM_CLOUDANT_API_KEY
  if (cloudantKey) candidates.push(cloudantKey)

  const nluKey = process.env.WATSON_NLU_API_KEY
  if (nluKey) candidates.push(nluKey)

  // Append CPD key as a final fallback in case this is a custom setup
  if (watsonxKey && watsonxKey.startsWith('cpd-')) {
    candidates.push(watsonxKey)
  }

  if (candidates.length === 0) {
    throw new Error('[IAM] No API keys found in environment variables')
  }

  let lastError: Error | null = null

  for (const key of candidates) {
    try {
      const res = await fetch(iamUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${key}`,
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '(no body)')
        throw new Error(`HTTP ${res.status}: ${body}`)
      }

      const data = await res.json() as {
        access_token: string
        expires_in: number
        token_type: string
      }

      if (!data.access_token) {
        throw new Error('Response did not include access_token')
      }

      cachedToken = {
        token: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      }

      return cachedToken.token
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  throw new Error(`[IAM] All token exchange attempts failed. Last error: ${lastError?.message}`)
}

/**
 * Clears the cached token. Useful in tests or after credential rotation.
 */
export function clearTokenCache(): void {
  cachedToken = null
}
