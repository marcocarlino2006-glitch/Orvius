import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { normalizeEmail } from "@/lib/magic-link";
import { passwordProblem, setVerifiedPassword, hashPassword, verifyPasswordHash } from "@/lib/password-auth";
import { prisma } from "@/lib/prisma";
import { sharedRateLimit } from "@/lib/rate-limit";
import {
  confirmTwoStep,
  disableTwoStep,
  regenerateRecoveryCodes,
  startTwoStep,
  twoStepStatus,
} from "@/lib/two-step";

/*
  Sign-in security belongs to the person, not the shop: a technician and the
  owner each have their own password and two-step, keyed by sign-in email.
*/

async function signedInEmail() {
  const session = await auth();
  const email = session?.user?.email;
  return email ? normalizeEmail(email) : null;
}

async function status(email: string) {
  const login = await prisma.passwordLogin.findUnique({ where: { email }, select: { id: true } });
  return { password: { set: Boolean(login) }, twoStep: await twoStepStatus(email) };
}

export async function GET() {
  const email = await signedInEmail();
  if (!email) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return NextResponse.json(await status(email));
}

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("password"), current: z.string().max(200).optional(), next: z.string().max(200) }),
  z.object({ action: z.literal("two_step_start") }),
  z.object({ action: z.literal("two_step_confirm"), code: z.string().max(20) }),
  z.object({ action: z.literal("two_step_disable"), code: z.string().max(20) }),
  z.object({ action: z.literal("recovery_codes"), code: z.string().max(20) }),
]);

export async function POST(request: Request) {
  const email = await signedInEmail();
  if (!email) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const limit = await sharedRateLimit({ key: `account-security:${email}`, limit: 20, windowMs: 15 * 60 * 1000 });
  if (!limit.ok) return NextResponse.json({ error: "Too many tries. Wait 15 minutes and try again." }, { status: 429 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That request couldn't be read. Refresh and try again." }, { status: 400 });
  const body = parsed.data;

  if (body.action === "password") {
    const weak = passwordProblem(body.next);
    if (weak) return NextResponse.json({ error: weak }, { status: 400 });
    const login = await prisma.passwordLogin.findUnique({ where: { email } });
    if (login) {
      if (!body.current || !(await verifyPasswordHash(body.current, login.passwordHash))) {
        return NextResponse.json({ error: "Your current password didn't match." }, { status: 400 });
      }
      // Changing a password proves nothing about the address, so verifiedAt stays as it was.
      await prisma.passwordLogin.update({
        where: { id: login.id },
        data: { passwordHash: await hashPassword(body.next), failedCount: 0, lockedUntil: null },
      });
    } else {
      // No password yet means this session came from Google or an email link: the address is proven.
      const saved = await setVerifiedPassword(email, body.next);
      if (!saved.ok) return NextResponse.json({ error: saved.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ...(await status(email)) });
  }

  if (body.action === "two_step_start") {
    const started = await startTwoStep(email);
    if (!started.ok) return NextResponse.json({ error: started.error }, { status: 409 });
    return NextResponse.json(started);
  }

  const result =
    body.action === "two_step_confirm"
      ? await confirmTwoStep(email, body.code)
      : body.action === "two_step_disable"
        ? await disableTwoStep(email, body.code)
        : await regenerateRecoveryCodes(email, body.code);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ...result, ...(await status(email)) });
}
