'use client'

/**
 * components/auth/session-provider.tsx
 * Client-side SessionProvider wrapper for NextAuth v5.
 */

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react'

export default function SessionProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>
}
