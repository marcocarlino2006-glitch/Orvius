import { NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/domains";
import { acceptEstimate } from "@/lib/estimate-choice";
import { requirePlanModule } from "@/lib/plan-gate";
import { mintPublicToken } from "@/lib/public-tokens";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, requireEntitledSession } from "@/lib/tenant";
import { personActor } from "@/lib/audit";
import { z } from "zod";

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send") }),
  z.object({ action: z.literal("choose"), option: z.string().min(1).max(20) }),
]);

type Params = { params: Promise<{ id: string }> };

/** Send mints the customer link; choose records the option a customer picked by phone. */
export async function PATCH(request: Request, { params }: Params) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "jobs");
  if ("error" in planGate) return planGate.error;

  const { id } = await params;

  try {
    const body = patchSchema.parse(await request.json());

    const estimate = await prisma.estimate.findFirst({
      where: { id, businessId: business.id },
    });
    if (!estimate) return forbiddenResponse();

    if (body.action === "choose") {
      const result = await acceptEstimate({
        estimateId: estimate.id,
        optionKey: body.option,
        by: "shop",
        ...personActor(authResult),
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ ok: true, option: result.option });
    }

    const publicToken = estimate.publicToken ?? mintPublicToken();
    const updated = await prisma.estimate.update({
      where: { id: estimate.id },
      data: {
        status: estimate.status === "accepted" ? estimate.status : "sent",
        publicToken,
        sentAt: estimate.sentAt ?? new Date(),
      },
    });

    const shareUrl = `${getAppBaseUrl()}/e/${publicToken}`;

    return NextResponse.json({
      estimate: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        sentAt: updated.sentAt?.toISOString() ?? null,
        acceptedAt: updated.acceptedAt?.toISOString() ?? null,
      },
      shareUrl,
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.errors.map((e) => e.message).join(", ")
        : error instanceof Error
          ? error.message
          : "Could not send estimate";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
