/**
 * GET /api/repos
 * Returns the authenticated user's GitHub repositories.
 * Uses the OAuth access token from the session.
 */

import { auth } from '@/lib/auth'
import { Octokit } from 'octokit'

export async function GET(): Promise<Response> {
  const session = await auth()

  if (!session?.accessToken) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const octokit = new Octokit({ auth: session.accessToken })

    const repos = await octokit.rest.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 100,
      type: 'owner',
    })

    const items = repos.data.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      url: repo.html_url,
      private: repo.private,
      language: repo.language,
      updatedAt: repo.updated_at,
      description: repo.description,
    }))

    return Response.json({ repos: items })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[GET /api/repos] Error: ${message}`)
    return Response.json({ error: 'Failed to fetch repositories' }, { status: 500 })
  }
}
