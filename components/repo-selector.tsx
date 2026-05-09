'use client'

/**
 * components/repo-selector.tsx
 * Searchable dropdown of the authenticated user's GitHub repos.
 * Fetches repos from GET /api/repos on mount.
 * Calls onSelect(repoUrl) when a repo is chosen.
 */

import { useState, useEffect, useRef } from 'react'

interface Repo {
  id: number
  name: string
  fullName: string
  url: string
  private: boolean
  language: string | null
  updatedAt: string | null
  description: string | null
}

interface RepoSelectorProps {
  onSelect: (repoUrl: string) => void
}

export default function RepoSelector({ onSelect }: RepoSelectorProps) {
  const [repos, setRepos] = useState<Repo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function fetchRepos() {
      try {
        const res = await fetch('/api/repos')
        if (!res.ok) throw new Error('Failed to load repos')
        const data = await res.json() as { repos: Repo[] }
        setRepos(data.repos)
      } catch {
        setError('Could not load your repositories.')
      } finally {
        setLoading(false)
      }
    }
    fetchRepos()
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = repos.filter((r) =>
    r.fullName.toLowerCase().includes(query.toLowerCase())
  )

  if (error) {
    return (
      <p className="text-xs" style={{ color: 'var(--color-critical)' }}>
        {error}
      </p>
    )
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setIsOpen(true)
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={loading ? 'Loading your repos…' : 'Search your repositories…'}
        disabled={loading}
        className="w-full rounded-lg px-4 py-3 text-sm font-mono transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border-subtle)',
          color: 'var(--color-text-primary)',
        }}
      />

      {isOpen && !loading && filtered.length > 0 && (
        <ul
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: '#222222',
          }}
          role="listbox"
        >
          {filtered.map((repo) => (
            <li key={repo.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(repo.url)
                  setQuery(repo.fullName)
                  setIsOpen(false)
                }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150"
                style={{ color: 'var(--color-text-primary)' }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = 'transparent')
                }
                role="option"
                aria-selected={false}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-mono">
                  {repo.fullName}
                </span>
                {repo.private && (
                  <span
                    className="shrink-0 rounded border px-1.5 py-0.5 text-xs"
                    style={{
                      borderColor: 'var(--color-border-subtle)',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    private
                  </span>
                )}
                {repo.language && (
                  <span
                    className="shrink-0 text-xs"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {repo.language}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {isOpen && !loading && filtered.length === 0 && query && (
        <div
          className="absolute z-50 mt-1 w-full rounded-lg border px-4 py-3 text-sm"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: '#222222',
            color: 'var(--color-text-tertiary)',
          }}
        >
          No repos matching &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  )
}
