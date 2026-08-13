// Edge-compatible HMAC-SHA256 session auth
// Works in both Next.js middleware (Edge Runtime) and API routes (Node.js)

export const COOKIE_NAME = "vcos_session";
const DAYS_30 = 30 * 24 * 60 * 60 * 1000;

// No hardcoded fallback: a known-in-source signing secret would let anyone
// forge a valid session (any username/role, including owner) in any
// deployment where AUTH_SECRET is unset. Fail loudly instead.
function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret)
    throw new Error(
      "AUTH_SECRET must be set - refusing to sign/verify sessions with no secret configured",
    );
  return secret;
}

function toBase64url(input: Uint8Array | ArrayBuffer): string {
  // IMPORTANT: respect the view's byteOffset/byteLength. In the Edge runtime
  // TextEncoder().encode() can return a Uint8Array backed by a larger pooled
  // ArrayBuffer, so `new Uint8Array(someView.buffer)` would read trailing
  // garbage. Always operate on the exact bytes of the view.
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromBase64url(str: string): Uint8Array {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}

// CRITICAL (Edge runtime): pass the Uint8Array *view* itself to subtle crypto -
// never `view.buffer`, which on Edge can be a larger pooled ArrayBuffer with
// trailing garbage, producing a different HMAC between sign and verify. The view
// carries the correct byteOffset/byteLength so only the real bytes are hashed.
// The `as BufferSource` cast is purely to satisfy the strict DOM lib typing
// (Uint8Array<ArrayBufferLike> vs ArrayBufferView<ArrayBuffer>); it does not
// change the runtime value.
function bytes(str: string): BufferSource {
  return new TextEncoder().encode(str) as unknown as BufferSource;
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    bytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSession(
  username: string,
  role: string,
): Promise<string> {
  const payload = toBase64url(
    new TextEncoder().encode(
      JSON.stringify({ u: username, r: role, e: Date.now() + DAYS_30 }),
    ),
  );
  const key = await getKey(getSecret());
  const sig = await crypto.subtle.sign("HMAC", key, bytes(payload));
  return `${payload}.${toBase64url(sig)}`;
}

export async function verifySession(
  token: string,
): Promise<{ username: string; role: string } | null> {
  try {
    const dot = token.lastIndexOf(".");
    if (dot === -1) return null;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const key = await getKey(getSecret());
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64url(sig) as unknown as BufferSource,
      bytes(payload),
    );
    if (!valid) return null;
    const { u, r, e } = JSON.parse(
      new TextDecoder().decode(fromBase64url(payload)),
    );
    if (Date.now() > e) return null;
    return { username: u, role: r };
  } catch {
    return null;
  }
}
