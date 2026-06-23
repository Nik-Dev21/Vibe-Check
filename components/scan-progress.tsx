'use client'

import { useEffect, useState } from 'react'
import type { ScanStatus } from '@/lib/types'

interface ScanProgressProps {
  scanId: string
  onComplete: () => void
}

const PHASES: Array<{ key: ScanStatus['phase']; label: string; description: string }> = [
  { key: 'fetching', label: 'Fetching Repository', description: 'Downloading files from GitHub…' },
  { key: 'classifying', label: 'Fast Classification', description: 'Featherless AI scanning all files…' },
  { key: 'deep-scan', label: 'Deep Analysis', description: 'IBM Granite auditing high-risk files…' },
  { key: 'context', label: 'Context Detection', description: 'Watson NLU analyzing app context…' },
  { key: 'building', label: 'Building Report', description: 'Assembling vulnerability report…' },
  { key: 'storing', label: 'Storing Results', description: 'Saving to IBM Cloud…' },
]

export default function ScanProgress({ scanId, onComplete }: ScanProgressProps) {
  const [status, setStatus] = useState<ScanStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stopped = false

    async function poll() {
      while (!stopped) {
        try {
          const res = await fetch(`/api/scan/${scanId}`)
          if (!res.ok) throw new Error(`Status ${res.status}`)
          const data: ScanStatus = await res.json()
          setStatus(data)
          if (data.status === 'complete') {
            onComplete()
            return
          }
          if (data.status === 'error') {
            setError(data.error ?? 'Scan failed.')
            return
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Unknown error')
          return
        }
        await new Promise((r) => setTimeout(r, 1500))
      }
    }

    poll()
    return () => { stopped = true }
  }, [scanId, onComplete])

  const currentPhaseIndex = PHASES.findIndex((p) => p.key === status?.phase)

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Scanning your repository</h2>
        <p className="text-[#666] text-sm">Powered by Featherless AI + IBM Granite</p>
      </div>

      {error ? (
        <div className="bg-[#ff3b30]/10 border border-[#ff3b30]/20 rounded-lg px-6 py-4 text-[#ff3b30] text-sm">
          {error}
        </div>
      ) : (
        <>
          <div className="w-full max-w-md">
            <div className="h-1 bg-[#222] rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${status?.progress ?? 0}%` }}
              />
            </div>
            <div className="flex justify-between mt-1 text-xs text-[#666]">
              <span>{status?.progress ?? 0}%</span>
              <span>{status?.phase ?? 'starting'}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 w-full max-w-md">
            {PHASES.map((phase, i) => {
              const isDone = currentPhaseIndex > i
              const isActive = currentPhaseIndex === i
              return (
                <div
                  key={phase.key}
                  className={`flex items-start gap-3 px-4 py-3 rounded-lg border transition-all duration-150 ${
                    isActive
                      ? 'bg-[#111] border-[#333] text-white'
                      : isDone
                      ? 'bg-transparent border-transparent text-[#444]'
                      : 'bg-transparent border-transparent text-[#333]'
                  }`}
                >
                  <span className="text-lg leading-none mt-0.5">
                    {isDone ? '✓' : isActive ? '⟳' : '○'}
                  </span>
                  <div>
                    <div className="text-sm font-semibold">{phase.label}</div>
                    {isActive && <div className="text-xs text-[#666] mt-0.5">{phase.description}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
