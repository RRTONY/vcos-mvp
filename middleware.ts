import { NextRequest, NextResponse } from 'next/server'

// Defaults — override in Netlify env vars (Site Settings → Environment Variables)
const USER = process.env.BASIC_AUTH_USER || 'ramprate'
const PASS = process.env.BASIC_AUTH_PASSWORD || 'vcos2026'

export function middleware(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''

  if (auth.startsWith('Basic ')) {
    try {
      const decoded = atob(auth.slice(6))
      const colon = decoded.indexOf(':')
      const user = decoded.slice(0, colon)
      const pass = decoded.slice(colon + 1)
      if (user === USER && pass === PASS) return NextResponse.next()
    } catch {
      // malformed auth header — fall through to 401
    }
  }

  return new NextResponse('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Visual Chief of Staff", charset="UTF-8"',
      'Content-Type': 'text/plain',
    },
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
