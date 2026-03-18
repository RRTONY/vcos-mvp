import { NextRequest, NextResponse } from 'next/server'

const USER = process.env.BASIC_AUTH_USER ?? 'ramprate'
const PASS = process.env.BASIC_AUTH_PASSWORD ?? ''

export function middleware(req: NextRequest) {
  // Skip if no password configured
  if (!PASS) return NextResponse.next()

  const auth = req.headers.get('authorization') ?? ''
  if (auth.startsWith('Basic ')) {
    const encoded = auth.slice(6)
    const decoded = atob(encoded)
    const colon = decoded.indexOf(':')
    const user = decoded.slice(0, colon)
    const pass = decoded.slice(colon + 1)
    if (user === USER && pass === PASS) return NextResponse.next()
  }

  return new NextResponse('Unauthorized — Visual Chief of Staff is private.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Visual Chief of Staff"' },
  })
}

export const config = {
  // Protect all pages but NOT api routes (they're server-side and key-protected)
  matcher: ['/((?!api|_next/static|_next/image|favicon\\.ico).*)'],
}
