// VCoS chatbot - streams Claude's reply, grounded in the VCoS brain (Tony's
// operating identity) + a live, role-scoped snapshot of VCOS data.
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_STATIC, buildLiveBlock } from "@/lib/vcos-brain";
import { buildChatContext } from "@/lib/chat-context";
import {
  loadConversation,
  saveConversation,
  addCommitments,
  extractLogBlocks,
  stripLogBlocks,
} from "@/lib/memory";
import { todayPT } from "@/lib/week-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Token-control settings ────────────────────────────────────────────────────
const MODEL = "claude-haiku-4-5-20251001";
const MAX_OUTPUT_TOKENS = 300; // enough for grounded Q&A; keeps output cost low
const HISTORY_TURNS = 4; // last N user+assistant turns sent to model
const DAILY_LIMIT = 80; // hard ceiling per user per PT calendar day
const BLOCK_AT = Math.floor(DAILY_LIMIT * 0.95); // 76 - block before hitting hard limit

const CONTACT_MSG =
  "You've reached today's message limit for VCoS-AI. Contact your admin to get more access.";

// Server-side live-context cache - 5 min TTL per user so the context block is
// byte-identical between turns (essential for Supabase query de-duplication).
const CTX_CACHE_TTL_MS = 5 * 60 * 1000;
const ctxCache = new Map<string, { ctx: string; ts: number }>();

// Daily call counter keyed by "username:YYYY-MM-DD" (PT calendar date).
const dayCounts = new Map<string, number>();

function getDayKey(username: string) {
  return `${username}:${todayPT()}`;
}

/** Returns remaining calls allowed. Returns 0 when limit reached. */
function consumeAndCheck(username: string): number {
  const key = getDayKey(username);
  const prev = dayCounts.get(key) ?? 0;
  const next = prev + 1;
  dayCounts.set(key, next);
  return Math.max(0, DAILY_LIMIT - next);
}

function getCachedCtx(username: string): string | null {
  const e = ctxCache.get(username);
  return e && Date.now() - e.ts < CTX_CACHE_TTL_MS ? e.ctx : null;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  const role = req.headers.get("x-role");
  const username = req.headers.get("x-user");
  if (!role || !username)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY_CHAT;
  if (!apiKey)
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY_CHAT not configured" },
      { status: 500 },
    );

  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messages = (body.messages ?? [])
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim(),
    )
    .slice(-HISTORY_TURNS);
  if (!messages.length)
    return NextResponse.json({ error: "No messages" }, { status: 400 });

  // Daily rate limit - check before any Anthropic call
  const remaining = consumeAndCheck(username);
  if (remaining <= 0) {
    return NextResponse.json({ error: CONTACT_MSG }, { status: 429 });
  }

  const isAdmin = ["admin", "owner"].includes(role);

  // 5-min server-side context cache - avoids redundant Supabase queries and
  // keeps the live-context block identical between turns for de-duplication.
  let liveContext = getCachedCtx(username);
  if (!liveContext) {
    try {
      liveContext = await buildChatContext(username, isAdmin);
      ctxCache.set(username, { ctx: liveContext, ts: Date.now() });
    } catch {
      liveContext = "(Live VCOS data is temporarily unavailable.)";
    }
  }

  // Two cache breakpoints: SYSTEM_STATIC never changes, and the live block is
  // byte-identical for this user across the CTX_CACHE_TTL_MS window - so both
  // can hit Anthropic's prompt cache (5-min ephemeral TTL, same window) instead
  // of being billed as fresh input tokens on every turn.
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: SYSTEM_STATIC, cache_control: { type: "ephemeral" } },
    {
      type: "text",
      text: buildLiveBlock(liveContext),
      cache_control: { type: "ephemeral" },
    },
  ];

  const client = new Anthropic({ apiKey });
  const lastUser = messages[messages.length - 1];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      let full = "";
      try {
        const ai = client.messages.stream({
          model: MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          system,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        });
        ai.on("text", (delta) => {
          full += delta;
          controller.enqueue(enc.encode(delta));
        });
        await ai.finalMessage();
        controller.close();
      } catch (err) {
        // 429 = Anthropic rate limit, 529 = Anthropic overload - user-friendly msg
        const status =
          err instanceof Error && "status" in err
            ? (err as { status: number }).status
            : 0;
        // Previously silent - the user only ever saw the generic fallback
        // below with no way to tell an expired API key from an Anthropic
        // outage from a bad request. Log the real error so this is
        // diagnosable from Netlify function logs.
        console.error(
          `[chat] Anthropic call failed for ${username} (status ${status}):`,
          err,
        );
        const friendly =
          status === 429 || status === 529
            ? CONTACT_MSG
            : "VCoS-AI is temporarily unavailable. Please try again in a moment.";
        controller.enqueue(enc.encode(`\n\n⚠️ ${friendly}`));
        controller.close();
      }

      // Post-stream: log commitments and persist conversation. Never affects the
      // response the user already received.
      try {
        const cleaned = stripLogBlocks(full);
        const logs = extractLogBlocks(full);
        if (logs.length) await addCommitments(logs, username);
        if (cleaned.trim() && !cleaned.startsWith("⚠️")) {
          const now = new Date().toISOString();
          const prior = await loadConversation(username);
          await saveConversation(username, [
            ...prior,
            { role: "user", content: lastUser.content, at: now },
            { role: "assistant", content: cleaned, at: now },
          ]);
        }
      } catch {
        /* best-effort */
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
