import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifySession } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { invalidateTeamCache } from "@/lib/team-db";

// GET - any logged-in user can read the team list
export async function GET(req: NextRequest) {
  const role = req.headers.get("x-role");
  if (!role)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();
  const { data, error } = await sb
    .from("team_members")
    .select("*")
    .order("full_name");

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST - create new team member (admin only)
export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session || !["admin", "owner"].includes(session.role)) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.full_name)
    return NextResponse.json(
      { error: "full_name is required" },
      { status: 400 },
    );

  const sb = getSupabase();
  const { data, error } = await sb
    .from("team_members")
    .insert({
      full_name: body.full_name,
      vcos_username: body.vcos_username ?? null,
      email: body.email ?? null,
      slack_aliases: body.slack_aliases ?? [],
      slack_user_id: body.slack_user_id ?? null,
      clickup_key: body.clickup_key ?? null,
      clickup_user_id: body.clickup_user_id ?? null,
      braintrust_name: body.braintrust_name ?? null,
      webwork_username: body.webwork_username ?? null,
      webwork_user_id: body.webwork_user_id ?? null,
      webwork_contract_id: body.webwork_contract_id ?? null,
      fireflies_email: body.fireflies_email ?? null,
      role_description: body.role_description ?? null,
      hourly_rate: body.hourly_rate ?? 0,
      bills_hours: body.bills_hours ?? true,
      files_report: body.files_report ?? true,
      active: body.active ?? true,
    })
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateTeamCache();
  return NextResponse.json(data);
}

// PATCH - update a team member (admin only)
export async function PATCH(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session || !["admin", "owner"].includes(session.role)) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.id)
    return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { id, ...fields } = body;
  const sb = getSupabase();
  const { data, error } = await sb
    .from("team_members")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateTeamCache();
  return NextResponse.json(data);
}

// DELETE - deactivate (soft delete) a team member (owner only)
export async function DELETE(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session || session.role !== "owner") {
    return NextResponse.json(
      { error: "Owner access required" },
      { status: 403 },
    );
  }

  const { id } = await req.json().catch(() => ({}));
  if (!id)
    return NextResponse.json({ error: "id is required" }, { status: 400 });

  const sb = getSupabase();
  const { error } = await sb
    .from("team_members")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateTeamCache();
  return NextResponse.json({ ok: true });
}
