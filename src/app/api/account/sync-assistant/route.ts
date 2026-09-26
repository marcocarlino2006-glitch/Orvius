import { NextResponse } from "next/server";
import { ensureDedicatedShopLine } from "@/lib/provision-business";
import { syncBusinessAssistant } from "@/lib/sync-business-assistant";
import { requirePermission } from "@/lib/tenant";

export async function POST() {
  const authResult = await requirePermission("settings.edit", { entitled: false });
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  try {
    const { business: updated, repaired, dedicatedLine } =
      await ensureDedicatedShopLine(business);
    const sync = await syncBusinessAssistant(updated);

    return NextResponse.json({
      ok: true,
      repaired,
      dedicatedLine,
      line: updated.vapiPhoneNumber ?? updated.twilioPhone,
      business: {
        id: updated.id,
        name: updated.name,
        greeting: updated.greeting,
        twilioPhone: updated.twilioPhone,
        vapiPhoneNumber: updated.vapiPhoneNumber,
      },
      sync,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
