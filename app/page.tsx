import type { Metadata } from 'next'
import LandingClient from '@/components/landing/landing-client'

export const metadata: Metadata = {
  title: 'VibeCheck — Security Scanner for AI-Generated Code',
  description:
    'VibeCheck scans your GitHub repository for security vulnerabilities in seconds. Powered by IBM Granite, Watson NLU, and Featherless AI.',
}

export default function HomePage() {
  return <LandingClient />
}
