// Service sign-in for the Briefing Room / Command Centre API, shared by
// middleware.ts (edge) and app/api/briefing/route.ts. Plain JS compare so it
// runs in the edge runtime; constant-time so the token can't be guessed byte
// by byte from response timing.

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when the request carries the jobs' key or the Command Centre service token. */
export function isServiceRequest(headers: Headers): boolean {
  const key = process.env.BRIEFING_API_KEY;
  const sent = headers.get("x-briefing-key");
  if (key && sent && safeEqual(sent, key)) return true;
  const token = process.env.CC_SERVICE_TOKEN;
  const auth = headers.get("authorization") ?? "";
  if (token && auth.startsWith("Bearer ") && safeEqual(auth.slice(7).trim(), token))
    return true;
  return false;
}
