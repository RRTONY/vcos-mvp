import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, verifySession } from '@/lib/auth'

export async function middleware(req: NextRequest) {
  // Skip auth for login page and auth API routes
  const { pathname } = req.nextUrl
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt'
  ) {
    return NextResponse.next()
  }

  const token = req.cookies.get(COOKIE_NAME)?.value
  if (token) {
    const session = await verifySession(token)
    if (session) {
      // Pass username + role as headers for API routes to read
      const res = NextResponse.next()
      res.headers.set('x-user', session.username)
      res.headers.set('x-role', session.role)
      return res
    }
  }

  // Not authenticated — redirect to login
  const loginUrl = new URL('/login', req.url)
  loginUrl.searchParams.set('from', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
