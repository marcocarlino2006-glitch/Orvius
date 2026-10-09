import { NextResponse } from "next/server";
import { personActor, recordAudit } from "@/lib/audit";
import { GalleryRefused, galleryDraft, shareToGallery, withdrawFromGallery } from "@/lib/call-gallery";
import { logError } from "@/lib/logger";
import { requirePermission } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Exactly what the gallery would show for this call, before anything is shared. */
export async function GET(_request: Request, { params }: Params) {
  const authResult = await requirePermission("calls.publish");
  if ("error" in authResult) return authResult.error;
  const { id } = await params;
  return NextResponse.json(await galleryDraft(authResult.business.id, id), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: Params) {
  const authResult = await requirePermission("calls.publish");
  if ("error" in authResult) return authResult.error;
  const { business, email, role } = authResult;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { callerAgreed?: unknown };
  try {
    const row = await shareToGallery({ businessId: business.id, callId: id, sharedByEmail: email, callerAgreed: body.callerAgreed === true });
    await recordAudit({
      businessId: business.id,
      entityType: "call",
      entityId: id,
      action: "call.gallery_shared",
      summary: "Sent the call's masked transcript to the Orvius gallery for review; confirmed the caller agreed",
      ...personActor({ role, email }),
    });
    return NextResponse.json({ status: row.status });
  } catch (error) {
    if (error instanceof GalleryRefused) return NextResponse.json({ error: error.message }, { status: 409 });
    logError("gallery.share_failed", { businessId: business.id, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Couldn't share the call. Try again in a minute." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const authResult = await requirePermission("calls.publish", { entitled: false });
  if ("error" in authResult) return authResult.error;
  const { business, email, role } = authResult;
  const { id } = await params;
  if (await withdrawFromGallery(business.id, id)) {
    await recordAudit({
      businessId: business.id,
      entityType: "call",
      entityId: id,
      action: "call.gallery_withdrawn",
      summary: "Took the call off the Orvius gallery",
      ...personActor({ role, email }),
    });
  }
  return NextResponse.json({ status: "withdrawn" });
}
