import { NextResponse } from "next/server";
import { sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { changeTeammateRole, inviteTeammate, listTeam, removeTeammate } from "@/lib/team";
import { requireBusinessSession, requirePermission } from "@/lib/tenant";
import { can } from "@/lib/workspace-access";

export async function GET() {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) return authResult.error;
  const { business, email, role } = authResult;
  return NextResponse.json({ role, canManage: can(role, "team.manage"), people: await listTeam(business, email) });
}

export async function POST(request: Request) {
  const authResult = await requirePermission("team.manage");
  if ("error" in authResult) return authResult.error;
  const { business, email } = authResult;
  const limited = await sharedRateLimit({ key: `team-invite:${business.id}`, limit: 20, windowMs: 60 * 60_000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec, "That's a lot of invites. Try again in a bit.");
  const body = (await request.json().catch(() => ({}))) as { email?: unknown; role?: unknown };
  const result = await inviteTeammate({ business, email: body.email, role: body.role, invitedBy: email });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result, { status: 201 });
}

export async function PATCH(request: Request) {
  const authResult = await requirePermission("team.manage");
  if ("error" in authResult) return authResult.error;
  const { business, email, role } = authResult;
  const body = (await request.json().catch(() => ({}))) as { id?: unknown; role?: unknown };
  if (typeof body.id !== "string") return NextResponse.json({ error: "Missing teammate" }, { status: 400 });
  const result = await changeTeammateRole({ businessId: business.id, membershipId: body.id, role: body.role, by: email, byOwner: role === "owner" });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) return authResult.error;
  const { business, email, role } = authResult;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing teammate" }, { status: 400 });
  const result = await removeTeammate({
    businessId: business.id,
    membershipId: id,
    by: email,
    byOwner: role === "owner",
    canManage: can(role, "team.manage"),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
