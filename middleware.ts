import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifySession } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  // Skip auth for login page and auth API routes
  const { pathname } = req.nextUrl;
  // Allow cron POST requests authenticated by x-cron-secret header
  if (
    req.method === "POST" &&
    req.headers.get("x-cron-secret") === process.env.CRON_SECRET
  ) {
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (token) {
    const session = await verifySession(token);
    if (session) {
      // Forward username + role as REQUEST headers so API routes can read them
      const requestHeaders = new Headers(req.headers);
      requestHeaders.set("x-user", session.username);
      requestHeaders.set("x-role", session.role);
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
  }

  // Not authenticated - redirect to login
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
