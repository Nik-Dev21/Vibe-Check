'use client'

/**
 * components/report/results-client.tsx
 * Client island that manages fix panel state for the results page.
 * Renders VulnerabilityList + conditionally renders FixPanel.
 */

import { useState } from 'react'
import type { Vulnerability } from '@/lib/types'
import VulnerabilityList from '@/components/report/vulnerability-list'
import FixPanel from '@/components/report/fix-panel'

interface ResultsClientProps {
  vulnerabilities: Vulnerability[]
  repoUrl: string
}

export default function ResultsClient({ vulnerabilities, repoUrl }: ResultsClientProps) {
  const [activeVuln, setActiveVuln] = useState<Vulnerability | null>(null)

  function handleApplyFix(vuln: Vulnerability) {
    setActiveVuln(vuln)
    // Scroll to fix panel smoothly
    setTimeout(() => {
      document.getElementById('fix-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  function handleCloseFixPanel() {
    setActiveVuln(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <VulnerabilityList
        vulnerabilities={vulnerabilities}
        onApplyFix={handleApplyFix}
      />

      {activeVuln && (
        <div id="fix-panel" style={{ scrollMarginTop: '80px' }}>
          <FixPanel
            vulnerability={activeVuln}
            repoUrl={repoUrl}
            onClose={handleCloseFixPanel}
          />
        </div>
      )}
    </div>
  )
}
