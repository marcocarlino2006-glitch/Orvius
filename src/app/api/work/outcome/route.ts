import { NextResponse } from "next/server";
import { buildOutcome } from "@/lib/outcome";
import { requireEntitledSession } from "@/lib/tenant";

/** Where one request or job stands, stage by stage, from its own records. */
export async function GET(request: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const id = url.searchParams.get("id")?.trim() ?? "";
  if ((kind !== "job" && kind !== "request") || !id) return NextResponse.json({ error: "Which work?" }, { status: 400 });
  const outcome = await buildOutcome(authResult.business.id, kind === "job" ? { jobId: id } : { leadId: id });
  if (!outcome) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ outcome });
}
