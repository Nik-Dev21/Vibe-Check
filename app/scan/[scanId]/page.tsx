/**
 * app/scan/[scanId]/page.tsx
 * Full results page — assembles all report components.
 * Server Component. Uses MOCK_SCAN_REPORT.
 * Stream A swap: replace MOCK_SCAN_REPORT with real fetch when /api/scan/[scanId] is ready.
 */

import type { Metadata } from 'next'
import { MOCK_SCAN_REPORT } from '@/lib/mock-data'
import Navbar from '@/components/layout/navbar'
import Footer from '@/components/layout/footer'
import ReportHeader from '@/components/report/report-header'
import FileTree from '@/components/report/file-tree'
import ResultsClient from '@/components/report/results-client'

interface ScanResultPageProps {
  params: Promise<{ scanId: string }>
}

export async function generateMetadata({ params }: ScanResultPageProps): Promise<Metadata> {
  const { scanId } = await params
  // When Stream A is ready: fetch real report to get repoName
  const report = MOCK_SCAN_REPORT
  return {
    title: `VibeCheck — ${report.repoName} (${scanId})`,
    description: `Security scan results for ${report.repoUrl}. Score: ${report.securityScore}/100.`,
  }
}

export default async function ScanResultPage({ params }: ScanResultPageProps) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { scanId } = await params

  // ── Stream A swap (one line) ────────────────────────────────────────────────
  // When Stream A API is ready, replace this line:
  //   const report = MOCK_SCAN_REPORT
  // With:
  //   const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/scan/${scanId}`, { cache: 'no-store' })
  //   const report = await res.json() as ScanReport
  // ────────────────────────────────────────────────────────────────────────────
  const report = MOCK_SCAN_REPORT

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
        <div className="mb-8">
          <ReportHeader report={report} />
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
              report={report}
            />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
