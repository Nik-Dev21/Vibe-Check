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
let octokitToken: string | null = null

/**
 * Get an Octokit instance. Uses the provided token (from user's OAuth session)
 * if given, otherwise falls back to the env GITHUB_TOKEN.
 */
function getOctokit(token?: string): Octokit {
  const effectiveToken = token ?? process.env.GITHUB_TOKEN
  if (!effectiveToken) throw new Error('[GitHub] No GitHub token available')

  // If a per-request token is provided, always create a fresh client
  if (token) return new Octokit({ auth: token })

  // Reuse cached client for the env token
  if (octokitClient && octokitToken === effectiveToken) return octokitClient
  octokitClient = new Octokit({ auth: effectiveToken })
  octokitToken = effectiveToken
  return octokitClient
}

// ── Exported functions ────────────────────────────────────────────────────────

/**
 * Fetch all scannable files from a GitHub repo by downloading the tarball.
 * One HTTP round-trip pulls the whole repo, then we filter+extract in-memory.
 * Order-of-magnitude faster than fetching files one-by-one via the contents API.
 */
export async function getRepoFiles(repoUrl: string, token?: string): Promise<RepoFile[]> {
  const octokit = getOctokit(token)
  const { owner, repo } = parseRepoUrl(repoUrl)

  // Single API call returns the full repo as a gzipped tarball
  const tarRes = await octokit.rest.repos.downloadTarballArchive({
    owner, repo, ref: '',
  })

  // Octokit returns the raw bytes — type is loosely "unknown", coerce to ArrayBuffer
  const buffer = Buffer.from(tarRes.data as ArrayBuffer)
  return extractScannableFromTarball(buffer)
}

/**
 * Walk a gzipped tar archive and pull out scannable text files.
 * Pure Node — uses zlib.gunzipSync + a tiny tar parser; no external deps.
 */
function extractScannableFromTarball(gzipped: Buffer): RepoFile[] {
  // Lazy-import to keep startup cheap
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const zlib = require('zlib') as typeof import('zlib')
  const tarball = zlib.gunzipSync(gzipped)

  const files: RepoFile[] = []
  let offset = 0

  while (offset + 512 <= tarball.length) {
    const header = tarball.subarray(offset, offset + 512)
    // End-of-archive sentinel: a fully-zero header block
    if (header[0] === 0) break

    // Tar fields: name(100) mode(8) uid(8) gid(8) size(12 octal) mtime(12) chksum(8) type(1) link(100) magic(8) ...
    const nameRaw = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
    const prefixRaw = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '')
    const fullName = prefixRaw ? `${prefixRaw}/${nameRaw}` : nameRaw

    const sizeStr = header.subarray(124, 136).toString('utf8').replace(/[\0 ]+$/, '')
    const size = parseInt(sizeStr, 8) || 0
    const typeFlag = header[156] === 0 ? '0' : String.fromCharCode(header[156])

    const dataStart = offset + 512
    const dataEnd = dataStart + size
    // tar pads each entry to a 512-byte boundary
    const blocks = Math.ceil(size / 512)
    offset = dataStart + blocks * 512

    // Skip non-regular files (directories, symlinks, etc.)
    if (typeFlag !== '0' && typeFlag !== '\0') continue
    if (size === 0) continue
    if (size > MAX_FILE_SIZE_BYTES) continue

    // Strip the github archive's top-level dir (e.g. "owner-repo-abc123/foo.ts" → "foo.ts")
    const slashIdx = fullName.indexOf('/')
    if (slashIdx === -1) continue
    const path = fullName.slice(slashIdx + 1)
    if (!path || !isScannable(path)) continue

    const content = tarball.subarray(dataStart, dataEnd).toString('utf8')
    files.push({ path, content, size, language: getLanguage(path) })
  }

  return files
}

/**
 * Download the content of a single file from a GitHub repo.
 */
export async function getFileContent(repoUrl: string, filePath: string, token?: string): Promise<string> {
  const octokit = getOctokit(token)
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
export interface PRVulnMeta {
  title: string
  severity: string
  description: string
  lineNumber?: number
  explanation: string
}

export async function openPR(
  repoUrl: string,
  filePath: string,
  fixedContent: string,
  vulnerabilityId: string,
  token?: string,
  vulnMeta?: PRVulnMeta
): Promise<string> {
  const octokit = getOctokit(token)
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

  // Build PR title and body
  const prTitle = vulnMeta
    ? `VibeCheck: Fix ${vulnMeta.title}`
    : `[VibeCheck] Security fix for vulnerability ${vulnerabilityId}`

  const lineRef = vulnMeta?.lineNumber ? `:${vulnMeta.lineNumber}` : ''
  const prBody = vulnMeta
    ? [
        `## Security Fix`,
        '',
        `| Field | Value |`,
        `|-------|-------|`,
        `| **Vulnerability** | ${vulnMeta.title} |`,
        `| **Severity** | ${vulnMeta.severity} |`,
        `| **File** | \`${filePath}${lineRef}\` |`,
        `| **ID** | \`${vulnerabilityId}\` |`,
        '',
        `### Description`,
        vulnMeta.description,
        '',
        `### What was changed`,
        vulnMeta.explanation,
        '',
        `---`,
        `*Generated by [VibeCheck](https://github.com/Nik-Dev21/Vibe-Check) — powered by IBM watsonx.ai*`,
      ].join('\n')
    : `This PR was automatically generated by [VibeCheck](https://github.com/Nik-Dev21/Vibe-Check).\n\nFixes vulnerability \`${vulnerabilityId}\`.\n\n*Powered by IBM watsonx.ai*`

  // Open the PR
  const pr = await octokit.rest.pulls.create({
    owner,
    repo,
    title: prTitle,
    body: prBody,
    head: branchName,
    base: defaultBranch,
  })

  return pr.data.html_url
}

/**
 * Open a single GitHub PR with multiple file fixes.
 * Uses the Git Data API (tree + commit) to batch all changes into one commit.
 */
export interface BulkFixFile {
  filePath: string
  newContent: string
  vulnTitle: string
  severity: string
}

export async function openBulkPR(
  repoUrl: string,
  fixes: BulkFixFile[],
  token?: string
): Promise<string> {
  const octokit = getOctokit(token)
  const { owner, repo } = parseRepoUrl(repoUrl)

  // Get default branch and its latest commit
  const repoInfo = await octokit.rest.repos.get({ owner, repo })
  const defaultBranch = repoInfo.data.default_branch

  const refRes = await octokit.rest.git.getRef({
    owner, repo, ref: `heads/${defaultBranch}`,
  })
  const baseSha = refRes.data.object.sha

  // Get the base tree
  const baseCommit = await octokit.rest.git.getCommit({
    owner, repo, commit_sha: baseSha,
  })
  const baseTreeSha = baseCommit.data.tree.sha

  // Create blobs for each fixed file
  const treeItems = await Promise.all(
    fixes.map(async (fix) => {
      const blob = await octokit.rest.git.createBlob({
        owner, repo,
        content: Buffer.from(fix.newContent).toString('base64'),
        encoding: 'base64',
      })
      return {
        path: fix.filePath,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: blob.data.sha,
      }
    })
  )

  // Create a new tree with all the fixes
  const newTree = await octokit.rest.git.createTree({
    owner, repo,
    base_tree: baseTreeSha,
    tree: treeItems,
  })

  // Create a commit
  const newCommit = await octokit.rest.git.createCommit({
    owner, repo,
    message: `fix(security): patch ${fixes.length} critical vulnerabilities via VibeCheck`,
    tree: newTree.data.sha,
    parents: [baseSha],
  })

  // Create the branch
  const branchName = `vibecheck/bulk-fix-${Date.now()}`
  await octokit.rest.git.createRef({
    owner, repo,
    ref: `refs/heads/${branchName}`,
    sha: newCommit.data.sha,
  })

  // Build PR body with table of all fixes
  const fixTable = fixes
    .map((f) => `| \`${f.filePath}\` | ${f.severity} | ${f.vulnTitle} |`)
    .join('\n')

  const prBody = [
    `## Bulk Security Fix`,
    '',
    `This PR fixes **${fixes.length} critical vulnerabilities** detected by VibeCheck.`,
    '',
    `| File | Severity | Vulnerability |`,
    `|------|----------|---------------|`,
    fixTable,
    '',
    `---`,
    `*Generated by [VibeCheck](https://github.com/Nik-Dev21/Vibe-Check) — powered by IBM watsonx.ai*`,
  ].join('\n')

  const pr = await octokit.rest.pulls.create({
    owner,
    repo,
    title: `VibeCheck: Fix ${fixes.length} critical vulnerabilities`,
    body: prBody,
    head: branchName,
    base: defaultBranch,
  })

  return pr.data.html_url
}
