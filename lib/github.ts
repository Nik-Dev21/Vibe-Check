/**
 * lib/github.ts
 * GitHub API wrapper using Octokit.
 * Reads: GITHUB_TOKEN
 * Exports: getRepoFiles(), getFileContent(), openPR()
 */

import { Octokit } from 'octokit'
import type { RepoFile } from './types'

// Extensions to scan (must be low-risk of binary content)
const SCANNABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.php', '.java',
  '.json', '.yaml', '.yml', '.toml', '.ini',
  '.env', '.env.local', '.env.production', '.env.development',
  '.sh', '.bash',
])

// Max file size to avoid memory issues (500 KB)
const MAX_FILE_SIZE_BYTES = 500 * 1024

// Extension → language label map (best-effort)
const LANG_MAP: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript',
  '.js': 'JavaScript', '.jsx': 'JavaScript',
  '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.py': 'Python', '.rb': 'Ruby', '.go': 'Go',
  '.php': 'PHP', '.java': 'Java',
  '.json': 'JSON', '.yaml': 'YAML', '.yml': 'YAML',
  '.toml': 'TOML', '.ini': 'INI',
  '.env': 'ENV', '.sh': 'Shell', '.bash': 'Shell',
}

interface ParsedRepo {
  owner: string
  repo: string
}

function parseRepoUrl(repoUrl: string): ParsedRepo {
  // Accept https://github.com/owner/repo or owner/repo
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/)
    ?? repoUrl.match(/^([^/]+)\/([^/]+)$/)
  if (!match) throw new Error(`[GitHub] Cannot parse repo URL: ${repoUrl}`)
  return { owner: match[1], repo: match[2] }
}

function getExtension(path: string): string {
  const dotIdx = path.lastIndexOf('.')
  if (dotIdx === -1) return ''
  // Handle .env.local, .env.production etc.
  if (path.includes('.env')) return '.env'
  return path.slice(dotIdx)
}

function isScannable(path: string): boolean {
  const ext = getExtension(path)
  return SCANNABLE_EXTENSIONS.has(ext)
}

function getLanguage(path: string): string {
  const ext = getExtension(path)
  return LANG_MAP[ext] ?? 'Unknown'
}

let octokitClient: Octokit | null = null

function getOctokit(): Octokit {
  if (octokitClient) return octokitClient
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('[GitHub] GITHUB_TOKEN is not set')
  octokitClient = new Octokit({ auth: token })
  return octokitClient
}

// ── Exported functions ────────────────────────────────────────────────────────

/**
 * Fetch all scannable files from a public GitHub repo.
 * Downloads file contents inline. Skips files > 500 KB.
 */
export async function getRepoFiles(repoUrl: string): Promise<RepoFile[]> {
  const octokit = getOctokit()
  const { owner, repo } = parseRepoUrl(repoUrl)

  // Get the default branch SHA
  const repoInfo = await octokit.rest.repos.get({ owner, repo })
  const defaultBranch = repoInfo.data.default_branch

  const branchInfo = await octokit.rest.repos.getBranch({
    owner, repo, branch: defaultBranch,
  })
  const treeSha = branchInfo.data.commit.commit.tree.sha

  // Fetch full recursive tree
  const treeRes = await octokit.rest.git.getTree({
    owner, repo, tree_sha: treeSha, recursive: 'true',
  })

  const scannableItems = treeRes.data.tree.filter(
    (item) =>
      item.type === 'blob' &&
      item.path != null &&
      isScannable(item.path) &&
      (item.size ?? 0) <= MAX_FILE_SIZE_BYTES
  )

  // Download all files concurrently (batched to avoid rate limits)
  const BATCH = 20
  const files: RepoFile[] = []

  for (let i = 0; i < scannableItems.length; i += BATCH) {
    const batch = scannableItems.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(async (item) => {
        const content = await getFileContent(repoUrl, item.path!)
        return {
          path: item.path!,
          content,
          size: item.size ?? 0,
          language: getLanguage(item.path!),
        } satisfies RepoFile
      })
    )
    for (const r of results) {
      if (r.status === 'fulfilled') files.push(r.value)
      // Silently skip files that fail to download
    }
  }

  return files
}

/**
 * Download the content of a single file from a GitHub repo.
 */
export async function getFileContent(repoUrl: string, filePath: string): Promise<string> {
  const octokit = getOctokit()
  const { owner, repo } = parseRepoUrl(repoUrl)

  const res = await octokit.rest.repos.getContent({ owner, repo, path: filePath })

  const data = res.data
  if (Array.isArray(data)) throw new Error(`[GitHub] ${filePath} is a directory`)
  if (!('content' in data) || typeof data.content !== 'string') {
    throw new Error(`[GitHub] No content for ${filePath}`)
  }

  // Content is base64 encoded
  return Buffer.from(data.content, 'base64').toString('utf-8')
}

/**
 * Open a GitHub PR with a patched file.
 * Branch name: vibecheck/fix-{vulnerabilityId}
 * Returns the PR URL.
 */
export async function openPR(
  repoUrl: string,
  filePath: string,
  fixedContent: string,
  vulnerabilityId: string
): Promise<string> {
  const octokit = getOctokit()
  const { owner, repo } = parseRepoUrl(repoUrl)

  // Get default branch and its latest commit SHA
  const repoInfo = await octokit.rest.repos.get({ owner, repo })
  const defaultBranch = repoInfo.data.default_branch

  const refRes = await octokit.rest.git.getRef({
    owner, repo, ref: `heads/${defaultBranch}`,
  })
  const baseSha = refRes.data.object.sha

  const branchName = `vibecheck/fix-${vulnerabilityId.slice(0, 16)}`

  // Create the fix branch
  await octokit.rest.git.createRef({
    owner, repo,
    ref: `refs/heads/${branchName}`,
    sha: baseSha,
  })

  // Get the current file's blob SHA (needed for update)
  const currentFile = await octokit.rest.repos.getContent({
    owner, repo, path: filePath,
  })
  const fileData = currentFile.data
  if (Array.isArray(fileData) || !('sha' in fileData)) {
    throw new Error(`[GitHub] Cannot get SHA for ${filePath}`)
  }

  // Commit the fix
  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message: `fix(security): patch ${vulnerabilityId} via VibeCheck`,
    content: Buffer.from(fixedContent).toString('base64'),
    sha: fileData.sha,
    branch: branchName,
  })

  // Open the PR
  const pr = await octokit.rest.pulls.create({
    owner,
    repo,
    title: `[VibeCheck] Security fix for vulnerability ${vulnerabilityId}`,
    body: `This PR was automatically generated by [VibeCheck](https://github.com/Nik-Dev21/Vibe-Check).\n\nFixes vulnerability \`${vulnerabilityId}\`.`,
    head: branchName,
    base: defaultBranch,
  })

  return pr.data.html_url
}
