import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { CarrierId } from "@/lib/carrier-forward";
import { getShopLine, sendOwnerForwardGuide } from "@/lib/owner-setup";
import { requireEntitledSession } from "@/lib/tenant";

const bodySchema = z.object({
  mode: z.enum(["forward", "publish"]),
  carrier: z
    .enum(["verizon", "att", "tmobile", "other", "voip"])
    .optional(),
});

export async function POST(request: NextRequest) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;

  const business = authResult.business;
  const line = getShopLine(business);
  if (!line) {
    return NextResponse.json(
      { error: "Your shop line is still provisioning. Try again in a moment." },
      { status: 400 },
    );
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = await sendOwnerForwardGuide({
    business,
    orviusLine: line,
    mode: parsed.mode,
    carrier: parsed.carrier as CarrierId | undefined,
  });

  if (!result.sent) {
    return NextResponse.json(
      {
        error:
          result.reason === "no_owner_phone"
            ? "Add your mobile in Settings first"
            : "Could not send SMS right now. Copy the steps on screen instead.",
        reason: result.reason,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Setup steps texted to your mobile. Reply DONE when finished.",
  });
}
