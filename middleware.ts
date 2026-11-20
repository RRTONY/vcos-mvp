import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifySession } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  // Skip auth for login page and auth API routes
  const { pathname } = req.nextUrl;
  // x-user / x-role are identity headers that ONLY this middleware may set.
  // Strip any copy the caller sent, so routes that skip the session check
  // below (cron, webhooks, /api/auth/*) can never see a forged role.
  const cleanHeaders = new Headers(req.headers);
  cleanHeaders.delete("x-user");
  cleanHeaders.delete("x-role");
  const passThrough = () =>
    NextResponse.next({ request: { headers: cleanHeaders } });
  // Allow cron POST requests authenticated by x-cron-secret header
  if (
    req.method === "POST" &&
    req.headers.get("x-cron-secret") === process.env.CRON_SECRET
  ) {
    return passThrough();
  }
  // Scheduled Briefing Room jobs authenticate with their own key; the route
  // itself re-checks it before granting automation access.
  if (
    pathname === "/api/briefing" &&
    process.env.BRIEFING_API_KEY &&
    req.headers.get("x-briefing-key") === process.env.BRIEFING_API_KEY
  ) {
    return passThrough();
  }

  // ClickUp webhook - no session; the route verifies ClickUp's HMAC signature.
  if (pathname === "/api/clickup-webhook" && req.method === "POST") {
    return passThrough();
  }

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  ) {
    return passThrough();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (token) {
    const session = await verifySession(token);
    if (session) {
      // Forward username + role as REQUEST headers so API routes can read them
      cleanHeaders.set("x-user", session.username);
      cleanHeaders.set("x-role", session.role);
      return NextResponse.next({ request: { headers: cleanHeaders } });
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
