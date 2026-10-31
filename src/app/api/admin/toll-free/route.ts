import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isPrivilegedRequest } from "@/lib/admin-access";
import { submitTollFreeVerification } from "@/lib/toll-free-submit";
import { privilegedActor, recordPlatformAudit } from "@/lib/platform-audit";

const bodySchema = z.object({
  ein: z.string().max(20),
  street: z.string().max(120),
  street2: z.string().max(120).optional(),
  city: z.string().max(80),
  state: z.string().max(40),
  postalCode: z.string().max(12),
  firstName: z.string().max(60),
  lastName: z.string().max(60),
  phone: z.string().max(20),
});

/** Files the shared sender's toll-free verification with Twilio from the founder's form. */
export async function POST(request: NextRequest) {
  if (!(await isPrivilegedRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Fill in every field." }, { status: 400 });
  const result = await submitTollFreeVerification(parsed.data);
  await recordPlatformAudit(await privilegedActor(request), {
    action: result.ok ? "admin.toll_free.submitted" : "admin.toll_free.refused",
    summary: result.ok ? "Filed toll-free texting verification" : `Toll-free verification refused: ${result.error}`,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
