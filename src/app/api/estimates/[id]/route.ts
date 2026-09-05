import { NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/domains";
import { requirePlanModule } from "@/lib/plan-gate";
import { mintPublicToken } from "@/lib/public-tokens";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, requireEntitledSession } from "@/lib/tenant";
import { z } from "zod";

const patchSchema = z.object({
  action: z.enum(["send"]),
});

type Params = { params: Promise<{ id: string }> };

/** Send estimate — mint public token and mark sent. */
export async function PATCH(request: Request, { params }: Params) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "jobs");
  if ("error" in planGate) return planGate.error;

  const { id } = await params;

  try {
    const body = patchSchema.parse(await request.json());
    if (body.action !== "send") {
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }

    const estimate = await prisma.estimate.findFirst({
      where: { id, businessId: business.id },
    });
    if (!estimate) return forbiddenResponse();

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
