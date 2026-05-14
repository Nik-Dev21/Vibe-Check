/**
 * lib/scanner/file-prioritizer.ts
 * Sorts files by security risk likelihood before scanning, and gates out
 * files that are too large or in non-scannable directories.
 *
 * Priority order (highest first):
 *   1. .env files / names containing secret|key|token|password
 *   2. auth/, api/, middleware/ paths
 *   3. Config files (.json, .yaml, .toml, .ini)
 *   4. Source files (.ts, .tsx, .js, .jsx, .py, etc.)
 *   5. Everything else
 */

import type { RepoFile } from '../types'

const SKIP_DIR_PREFIXES = [
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  '.next/',
  '.cache/',
  'coverage/',
  'vendor/',
]

const MAX_FILE_BYTES = 100_000

// Cap scan at this many top-priority files. Most security signal lives in the
// top-30; scanning more burns budget+wall-clock for diminishing returns.
const MAX_FILES_TO_SCAN = 30

const HIGH_RISK_NAME_PATTERN = /secret|key|token|password|credential|apikey|api_key/i

const CONFIG_EXTENSIONS = new Set(['.json', '.yaml', '.yml', '.toml', '.ini', '.env'])

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.php', '.java', '.sh', '.bash',
])

const HIGH_RISK_PATHS = ['auth/', '/auth/', 'api/', '/api/', 'middleware/', '/middleware/']

function getExtension(path: string): string {
  if (path.includes('.env')) return '.env'
  const dot = path.lastIndexOf('.')
  return dot === -1 ? '' : path.slice(dot).toLowerCase()
}

function priorityScore(file: RepoFile): number {
  const name = file.path.split('/').pop() ?? file.path
  const ext = getExtension(file.path)

  // Priority 1 — env files or secret-named files
  if (ext === '.env' || HIGH_RISK_NAME_PATTERN.test(name)) return 100

  // Priority 2 — auth / api / middleware directories
  if (HIGH_RISK_PATHS.some((p) => file.path.includes(p))) return 80

  // Priority 3 — config files
  if (CONFIG_EXTENSIONS.has(ext)) return 60

  // Priority 4 — source files
  if (SOURCE_EXTENSIONS.has(ext)) return 40

  return 0
}

function shouldSkip(file: RepoFile): boolean {
  // Directory exclusions
  if (SKIP_DIR_PREFIXES.some((prefix) => file.path.startsWith(prefix))) return true

  // Also catch paths that contain these as sub-directories
  if (
    file.path.includes('/node_modules/') ||
    file.path.includes('/.git/')
  ) return true

  // File size gate
  if (file.content.length > MAX_FILE_BYTES) {
    console.log(`[prioritizer] Skipping ${file.path} — ${file.content.length} chars > 100k limit`)
    return true
  }

  return false
}

/**
 * Filter out non-scannable files and sort remaining files by security risk
 * priority so high-risk files are scanned first, surfacing critical findings fast.
 */
export function prioritizeFiles(files: RepoFile[]): RepoFile[] {
  const scannable = files.filter((f) => !shouldSkip(f))
  const skipped = files.length - scannable.length
  if (skipped > 0) {
    console.log(`[prioritizer] Skipped ${skipped} files (too large / excluded dirs), ${scannable.length} remain`)
  }

  const sorted = [...scannable].sort((a, b) => priorityScore(b) - priorityScore(a))
  if (sorted.length > MAX_FILES_TO_SCAN) {
    console.log(`[prioritizer] Capping scan at top ${MAX_FILES_TO_SCAN} files (had ${sorted.length})`)
    return sorted.slice(0, MAX_FILES_TO_SCAN)
  }
  return sorted
}
