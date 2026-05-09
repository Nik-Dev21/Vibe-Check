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
  const apiKey = process.env.WATSONX_API_KEY

  if (!iamUrl) {
    throw new Error('[IAM] IBM_IAM_TOKEN_URL is not set')
  }
  if (!apiKey) {
    throw new Error('[IAM] WATSONX_API_KEY is not set')
  }

  const res = await fetch(iamUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${apiKey}`,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)')
    throw new Error(`[IAM] Token exchange failed — HTTP ${res.status}: ${body}`)
  }

  const data = await res.json() as {
    access_token: string
    expires_in: number
    token_type: string
  }

  if (!data.access_token) {
    throw new Error('[IAM] Response did not include access_token')
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }

  return cachedToken.token
}

/**
 * Clears the cached token. Useful in tests or after credential rotation.
 */
export function clearTokenCache(): void {
  cachedToken = null
}
