import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { postMessage } from "@/lib/slack";
import { SLACK_ADMIN_CHANNEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { name, email, username_requested, message } = await req.json();
    if (!name)
      return NextResponse.json({ error: "Name required" }, { status: 400 });

    // role_requested is never taken from the request body - the signup form
    // has no role selector, so any non-'user' value here would only come
    // from someone calling this API directly to self-nominate for admin/owner.
    const { error } = await supabase.from("vcos_signup_requests").insert({
      name,
      email,
      username_requested,
      role_requested: "user",
      message,
      status: "pending",
    });

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    // Notify admin on Slack
    try {
      if (process.env.SLACK_BOT_TOKEN) {
        await postMessage(
          process.env.SLACK_ADMIN_CHANNEL ?? SLACK_ADMIN_CHANNEL,
          `🔔 New VCOS access request from *${name}*${email ? ` (${email})` : ""}\nRequested username: ${username_requested || "-"}\n${message ? `Message: ${message}` : ""}\nApprove in VCoS → Team & Users → Requests (/settings/people)`,
        );
      }
    } catch (e) {
      // Non-fatal for the signup, but logged so a broken channel is visible.
      console.error("[signup] admin Slack notification failed:", e);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
