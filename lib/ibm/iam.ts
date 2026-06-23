let cachedToken: { token: string; expiresAt: number } | null = null

export async function getIBMToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token
  }
  const res = await fetch(process.env.IBM_IAM_TOKEN_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${process.env.WATSONX_API_KEY}`,
  })
  if (!res.ok) {
    throw new Error(`IBM IAM token fetch failed: ${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return cachedToken.token
}

export function clearCachedToken() {
  cachedToken = null
}
