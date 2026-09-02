import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDedicatedShopLine } from "@/lib/provision-business";
import { syncBusinessAssistant } from "@/lib/sync-business-assistant";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();

  if (!email || !session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findFirst({
    where: { ownerEmail: email, isActive: true },
    orderBy: { createdAt: "asc" },
  });

  if (!business) {
    return NextResponse.json({ error: "No shop linked" }, { status: 404 });
  }

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
