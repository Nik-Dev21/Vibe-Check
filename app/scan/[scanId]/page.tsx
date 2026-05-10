import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { MOCK_SCAN_REPORT } from '@/lib/mock-data'
import { getScan } from '@/lib/ibm/cloudant'
import { getReport } from '@/lib/ibm/cos'
import type { ScanReport, ScanStatus } from '@/lib/types'
import ResultsClient from '@/components/report/results-client'

interface ScanResultPageProps {
  params: Promise<{ scanId: string }>
}

async function fetchReport(scanId: string): Promise<{ report: ScanReport; isPartial: boolean }> {
  if (scanId === 'mock') return { report: MOCK_SCAN_REPORT, isPartial: false }

  const doc = await getScan(scanId)
  if (!doc) throw new Error('Scan not found')

  if ('status' in doc) {
    const s = doc as ScanStatus
    if (s.status === 'error') throw new Error(`Scan failed: ${s.error ?? 'unknown'}`)
    // Still scanning with no partial findings yet — redirect to loading
    if (s.status === 'scanning' && s.phase !== 'storing') {
      redirect(`/scan/${scanId}/loading`)
    }
  }

  // Try to get the full report from COS, fall back to Cloudant doc
  const fullReport = await getReport(scanId).catch(() => null)
  const report = fullReport ?? (doc as unknown as ScanReport)

  // Determine if enrichment is still running
  const raw = doc as unknown as Record<string, unknown>
  const isPartial =
    ('status' in doc && (doc as ScanStatus).status !== 'complete') ||
    ((raw.enrichingFiles as string[] | undefined)?.length ?? 0) > 0

  return { report, isPartial }
}

export async function generateMetadata({ params }: ScanResultPageProps): Promise<Metadata> {
  const { scanId } = await params
  const { report } = await fetchReport(scanId)
  return {
    title: `VibeCheck — ${report.repoName} (${scanId})`,
    description: `Security scan results for ${report.repoUrl}. Score: ${report.securityScore}/100.`,
  }
}

export default async function ScanResultPage({ params }: ScanResultPageProps) {
  const session = await auth()
  if (!session) redirect('/')

  const { scanId } = await params
  const { report, isPartial } = await fetchReport(scanId)

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--color-bg-primary)' }}>
      <ResultsClient report={report} scanId={scanId} isPartial={isPartial} />
    </div>
  )
}
