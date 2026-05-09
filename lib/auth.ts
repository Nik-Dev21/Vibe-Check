/**
 * lib/auth.ts
 * NextAuth v5 configuration — GitHub OAuth provider.
 * Stores the GitHub access token in the session so API routes
 * can use it to fetch private repos and open PRs on the user's behalf.
 */

import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'

declare module 'next-auth' {
  interface Session {
    accessToken?: string
    user: {
      id?: string
      name?: string | null
      email?: string | null
      image?: string | null
      login?: string
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
declare module '@auth/core/jwt' {
  interface JWT {
    accessToken?: string
    login?: string
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      authorization: {
        params: {
          scope: 'read:user repo',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // On initial sign-in, persist the GitHub access token and username
      if (account) {
        token.accessToken = account.access_token
      }
      if (profile) {
        token.login = (profile as { login?: string }).login
      }
      return token
    },
    async session({ session, token }) {
      // Expose accessToken and GitHub username to the client session
      session.accessToken = token.accessToken
      if (token.login) {
        session.user.login = token.login
      }
      return session
    },
  },
  pages: {
    signIn: '/',
  },
})
