'use client'

import { useState, useMemo } from 'react'
import type { Vulnerability, Severity } from '@/lib/types'

export interface FileTreeProps {
  vulnerabilities: Vulnerability[]
  filesScanned: number
  activeFile: string | null
  onSelect: (path: string | null) => void
}

const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']

const SEV_COLOR: Record<string, string> = {
  CRITICAL: 'var(--color-critical)',
  HIGH:     'var(--color-high)',
  MEDIUM:   'var(--color-medium)',
  LOW:      'var(--color-low)',
  INFO:     'var(--color-text-tertiary)',
}

function highestSev(sevs: Severity[]): Severity {
  for (const s of SEVERITY_ORDER) if (sevs.includes(s)) return s
  return 'INFO'
}

interface TreeNode {
  kind: 'folder' | 'file'
  name: string       // display name (basename)
  fullPath: string   // full path (files only)
  level: number
  riskMax?: Severity
  count: number
  expanded?: boolean
}

function buildTree(vulns: Vulnerability[]): TreeNode[] {
  // Map full file path → severities
  const fileMap = new Map<string, Severity[]>()
  for (const v of vulns) {
    const arr = fileMap.get(v.filePath) ?? []
    arr.push(v.severity)
    fileMap.set(v.filePath, arr)
  }

  // Build folder hierarchy
  const folderMap = new Map<string, { sevs: Severity[]; count: number }>()
  for (const [path, sevs] of fileMap) {
    const parts = path.split('/')
    for (let i = 1; i < parts.length; i++) {
      const folder = parts.slice(0, i).join('/')
      const entry = folderMap.get(folder) ?? { sevs: [], count: 0 }
      entry.sevs.push(...sevs)
      entry.count += sevs.length
      folderMap.set(folder, entry)
    }
  }

  // Collect unique folder paths sorted
  const allPaths = Array.from(fileMap.keys()).sort()
  const folders = new Set<string>()
  for (const p of allPaths) {
    const parts = p.split('/')
    for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join('/'))
  }

  const nodes: TreeNode[] = []
  const sortedFolders = Array.from(folders).sort()

  // Root-level files (no folder)
  const rootFiles = allPaths.filter(p => !p.includes('/'))
  for (const p of rootFiles) {
    const sevs = fileMap.get(p) ?? []
    nodes.push({ kind: 'file', name: p, fullPath: p, level: 0, riskMax: highestSev(sevs), count: sevs.length })
  }

  // Folders + their files
  const emittedFolders = new Set<string>()
  for (const folder of sortedFolders) {
    if (emittedFolders.has(folder)) continue
    emittedFolders.add(folder)
    const level = folder.split('/').length - 1
    const name = folder.split('/').pop() ?? folder
    const entry = folderMap.get(folder)
    nodes.push({
      kind: 'folder', name, fullPath: folder, level,
      riskMax: entry ? highestSev(entry.sevs) : 'INFO',
      count: entry?.count ?? 0,
      expanded: true,
    })
    // Files directly in this folder
    const prefix = folder + '/'
    const filesInFolder = allPaths.filter(p => {
      if (!p.startsWith(prefix)) return false
      const rest = p.slice(prefix.length)
      return !rest.includes('/')
    })
    for (const fp of filesInFolder) {
      const sevs = fileMap.get(fp) ?? []
      nodes.push({
        kind: 'file', name: fp.split('/').pop() ?? fp, fullPath: fp,
        level: level + 1, riskMax: highestSev(sevs), count: sevs.length,
      })
    }
  }

  return nodes
}

export default function FileTreePanel({ vulnerabilities, filesScanned, activeFile, onSelect }: FileTreeProps) {
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const tree = useMemo(() => buildTree(vulnerabilities), [vulnerabilities])

  const visible = useMemo(() => {
    if (search.trim()) {
      return tree.filter(n => n.kind === 'file' && n.fullPath.toLowerCase().includes(search.toLowerCase()))
    }
    const out: TreeNode[] = []
    let suppressLevel: number | null = null
    for (const n of tree) {
      if (suppressLevel !== null && n.level > suppressLevel) continue
      if (suppressLevel !== null && n.level <= suppressLevel) suppressLevel = null
      out.push(n)
      if (n.kind === 'folder' && collapsed.has(n.fullPath)) suppressLevel = n.level
    }
    return out
  }, [tree, collapsed, search])

  const flaggedCount = new Set(vulnerabilities.map(v => v.filePath)).size
  const cleanCount = Math.max(0, filesScanned - flaggedCount)

  function toggleFolder(path: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%',
      background: 'var(--color-bg-secondary)',
      borderRight: '1px solid var(--color-border-subtle)',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px 10px',
        borderBottom: '1px solid var(--color-border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div className="uppercase-label">Files</div>
        <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {filesScanned} scanned
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 10px',
          background: 'var(--color-bg-tertiary)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 6,
        }}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Filter files…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              border: 'none', outline: 'none',
              background: 'transparent',
              color: 'var(--color-text-primary)',
              fontFamily: 'monospace',
              fontSize: 12, width: '100%',
            }}
          />
        </div>
      </div>

      {/* Tree */}
      <div className="scroll" style={{ flex: 1, minHeight: 0, padding: '6px 4px', overflowY: 'auto' }}>
        {visible.map((n, i) => {
          const isFolder = n.kind === 'folder'
          const isOpen = !collapsed.has(n.fullPath)
          const isActive = !isFolder && activeFile === n.fullPath
          const color = n.riskMax ? SEV_COLOR[n.riskMax] : SEV_COLOR.INFO

          return (
            <div
              key={n.fullPath + i}
              onClick={() => isFolder ? toggleFolder(n.fullPath) : onSelect(isActive ? null : n.fullPath)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 8px',
                paddingLeft: 8 + n.level * 14,
                borderRadius: 5,
                cursor: 'pointer',
                background: isActive ? 'var(--color-bg-hover)' : 'transparent',
                fontFamily: 'monospace', fontSize: 11.5,
                userSelect: 'none',
                transition: 'background 100ms',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.025)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
            >
              {isFolder ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"
                  style={{ color: 'var(--color-text-tertiary)', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 120ms', flexShrink: 0 }}>
                  <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <span style={{ width: 10, flexShrink: 0 }} />
              )}

              {/* Icon */}
              {isFolder ? (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
                  <path d="M1 4a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1H2a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
                  <path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              )}

              <span style={{
                flex: 1, color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {n.name}
              </span>

              {n.count > 0 && (
                <>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 10.5, color, minWidth: 14, textAlign: 'right', fontFamily: 'monospace' }}>
                    {n.count}
                  </span>
                </>
              )}
              {n.count === 0 && !isFolder && (
                <span style={{ color: 'var(--color-clean)', fontSize: 10, opacity: 0.6 }}>✓</span>
              )}
            </div>
          )
        })}

        {cleanCount > 0 && !search && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 8px', marginTop: 4,
            borderTop: '1px solid var(--color-border-subtle)',
            fontFamily: 'monospace', fontSize: 11,
            color: 'var(--color-text-tertiary)',
          }}>
            <span style={{ color: 'var(--color-clean)', opacity: 0.6 }}>✓</span>
            <span>{cleanCount} clean file{cleanCount !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{
        borderTop: '1px solid var(--color-border-subtle)',
        padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        flexShrink: 0,
      }}>
        {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(s => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: SEV_COLOR[s] }} />
            <span className="uppercase-label" style={{ fontSize: 9 }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
