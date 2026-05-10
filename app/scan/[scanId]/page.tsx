/**
 * app/scan/[scanId]/page.tsx
 * Full results page — assembles all report components.
 * Server Component. Uses MOCK_SCAN_REPORT.
 * Stream A swap: replace MOCK_SCAN_REPORT with real fetch when /api/scan/[scanId] is ready.
 */

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { MOCK_SCAN_REPORT } from '@/lib/mock-data'
import { getScan } from '@/lib/ibm/cloudant'
import { getReport } from '@/lib/ibm/cos'
import type { ScanReport, ScanStatus } from '@/lib/types'
import Navbar from '@/components/layout/navbar'
import Footer from '@/components/layout/footer'
import ReportHeader from '@/components/report/report-header'
import FileTree from '@/components/report/file-tree'
import ResultsClient from '@/components/report/results-client'
import BulkFixButton from '@/components/report/bulk-fix-button'

interface ScanResultPageProps {
  params: Promise<{ scanId: string }>
}

async function fetchReport(scanId: string): Promise<ScanReport> {
  if (scanId === 'mock') return MOCK_SCAN_REPORT

  // Call data layer directly — avoids HTTP round-trip + port mismatch in local dev
  const doc = await getScan(scanId)
  if (!doc) throw new Error('Scan not found')

  if ('status' in doc) {
    const s = doc as ScanStatus
    if (s.status === 'error') throw new Error(`Scan failed: ${s.error ?? 'unknown'}`)
    if (s.status !== 'complete') redirect(`/scan/${scanId}/loading`)
  }

  // Scan complete — full report from COS has the vulnerabilities array
  const fullReport = await getReport(scanId)
  return fullReport ?? (doc as unknown as ScanReport)
}

export async function generateMetadata({ params }: ScanResultPageProps): Promise<Metadata> {
  const { scanId } = await params
  const report = await fetchReport(scanId)
  return {
    title: `VibeCheck — ${report.repoName} (${scanId})`,
    description: `Security scan results for ${report.repoUrl}. Score: ${report.securityScore}/100.`,
  }
}

export default async function ScanResultPage({ params }: ScanResultPageProps) {
  const session = await auth()
  if (!session) redirect('/')

  const { scanId } = await params
  const report = await fetchReport(scanId)

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ backgroundColor: 'var(--color-bg-primary)' }}
    >
      <Navbar />

      <main
        id="main-content"
        className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8"
      >
        {/* Report header — full width */}
        <div className="mb-4">
          <ReportHeader report={report} />
        </div>

        {/* Bulk fix button — below header */}
        <div className="mb-8">
          <BulkFixButton
            vulnerabilities={report.vulnerabilities}
            repoUrl={report.repoUrl}
          />
        </div>

        {/* Two-column layout */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* Left column — file tree (sticky on desktop) */}
          <aside
            className="w-full shrink-0 lg:sticky lg:top-20 lg:w-72 lg:self-start"
            aria-label="File overview"
          >
            <FileTree
              vulnerabilities={report.vulnerabilities}
              filesScanned={report.filesScanned}
            />
          </aside>

          {/* Right column — vulnerability list + fix panel */}
          <div className="min-w-0 flex-1">
            <ResultsClient
              vulnerabilities={report.vulnerabilities}
              repoUrl={report.repoUrl}
            />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
