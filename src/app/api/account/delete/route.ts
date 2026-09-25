import { NextResponse } from "next/server";
import { z } from "zod";
import { requireBusinessSession } from "@/lib/tenant";
import { checkWorkspaceDeletion, deleteWorkspace } from "@/lib/workspace-deletion";

const bodySchema = z.object({ confirm: z.string().min(1) });

export async function POST(request: Request) {
  const session = await requireBusinessSession();
  if ("error" in session) return session.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Type the workspace name to confirm." }, { status: 400 });
  }

  const check = checkWorkspaceDeletion({
    business: session.business,
    requesterEmail: session.email,
    confirm: parsed.data.confirm,
  });
  if (!check.ok) {
    return NextResponse.json({ error: check.error, reason: check.reason }, { status: check.status });
  }

  await deleteWorkspace(session.business.id, session.business.ownerEmail);
  return NextResponse.json({
    ok: true,
    message: "Workspace deleted. Contact support if you want the phone number released.",
  });
}
