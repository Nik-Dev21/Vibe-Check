/**
 * app/api/auth/[...nextauth]/route.ts
 * NextAuth v5 route handler — delegates to the shared config in lib/auth.ts.
 */

import { handlers } from '@/lib/auth'

export const { GET, POST } = handlers
