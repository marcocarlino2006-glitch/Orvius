import { NextRequest, NextResponse } from "next/server";
import { releaseShopLine } from "@/lib/line-lifecycle";
import { buildAssistantSystemPrompt, slugify } from "@/lib/business";
import { assertCustomerShopLine } from "@/lib/demo-business";
import { isPrivilegedRequest } from "@/lib/admin-access";
import { getWebhookUrl } from "@/lib/env";
import {
  ensureDedicatedShopLine,
  DEFAULT_HOURS_JSON,
} from "@/lib/provision-business";
import { networkForNewShop } from "@/lib/network-choice";
import { prisma } from "@/lib/prisma";
import { syncBusinessAssistant } from "@/lib/sync-business-assistant";
import {
  buildVapiAssistantConfig,
  createAssistant,
  vapiRequest,
} from "@/lib/vapi";
import { performOnce, revertEffect } from "@/lib/provider-effect";
import { privilegedActor, recordPlatformAudit } from "@/lib/platform-audit";
import { z } from "zod";
import { ActivationRequiredError, defaultGreeting, draftActivationBusiness, recordSettledActivation, settleActivation } from "@/lib/activation-ack";

const createBusinessSchema = z.object({
  name: z.string().min(2),
  slug: z.string().optional(),
  phone: z.string().optional(),
  ownerPhone: z.string().min(10, "Owner mobile is required for a dedicated line"),
  ownerEmail: z.string().email().optional().or(z.literal("")),
  timezone: z.string().optional(),
  greeting: z.string().optional(),
  hoursJson: z.string().optional(),
  servicesJson: z.string().optional(),
  /**
   * The owner's approval of the call notice and of turning the line on, given
   * to Orvius staff outside the app. Recorded as an operator record with the
   * versions the owner was shown.
   */
  acknowledgement: z
    .object({
      ownerEmail: z.string().email(),
      method: z.enum(["written", "call", "in_person"]),
      reference: z.string().trim().min(3).max(300),
      operator: z.string().trim().min(2).max(120),
      noticeVersion: z.string().max(64),
      setupVersion: z.string().max(64),
    })
    .optional(),
});

const DEFAULT_LIST = 25;
const MAX_LIST = 200;

const staffReceptionistKey = (slug: string) => `staff-receptionist:${slug}`;

/** The admin key covers scripts. The founder session covers this page in the browser. */
async function denyUnlessPrivileged(request: NextRequest) {
  if (await isPrivilegedRequest(request)) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  const denied = await denyUnlessPrivileged(request);
  if (denied) return denied;

  const params = request.nextUrl.searchParams;
  const q = params.get("q")?.trim().slice(0, 80) ?? "";
  const limit = Math.min(Math.max(Number(params.get("limit")) || DEFAULT_LIST, 1), MAX_LIST);
  const where = q
    ? {
        OR: [
          { name: { contains: q } },
          { slug: { contains: q } },
          { ownerPhone: { contains: q } },
          { ownerEmail: { contains: q } },
          { twilioPhone: { contains: q } },
          { vapiPhoneNumber: { contains: q } },
        ],
      }
    : {};

  const [businesses, total] = await Promise.all([
    prisma.business.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        name: true,
        slug: true,
        ownerPhone: true,
        ownerEmail: true,
        greeting: true,
        vapiAssistantId: true,
        vapiPhoneNumber: true,
        twilioPhone: true,
        billingStatus: true,
        createdAt: true,
        _count: { select: { calls: true, leads: true } },
      },
    }),
    prisma.business.count({ where }),
  ]);

  return NextResponse.json(businesses, { headers: { "x-total-count": String(total) } });
}

export async function POST(request: NextRequest) {
  const denied = await denyUnlessPrivileged(request);
  if (denied) return denied;

  try {
    const body = createBusinessSchema.parse(await request.json());
    const slug = body.slug?.trim() || slugify(body.name);

    const existing = await prisma.business.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { error: "A business with this slug already exists" },
        { status: 409 },
      );
    }

    const greeting = body.greeting?.trim() || defaultGreeting(body.name);
    const ack = body.acknowledgement;
    let settled;
    try {
      settled = await settleActivation(draftActivationBusiness(body.name, greeting), {
        actorEmail: `operator:${ack?.operator ?? ""}`,
        claim: ack ? { recording: true, approved: true, noticeVersion: ack.noticeVersion, setupVersion: ack.setupVersion } : null,
        operator: ack ? { ownerEmail: ack.ownerEmail, method: ack.method, reference: ack.reference } : null,
        acceptedTerms: false,
        acceptedSms: false,
      });
    } catch (error) {
      if (!(error instanceof ActivationRequiredError)) throw error;
      return NextResponse.json(
        { error: "Record the owner's approval of this notice before the line goes live.", code: error.code, activation: error.terms },
        { status: 409 },
      );
    }
    const hoursJson = body.hoursJson ?? DEFAULT_HOURS_JSON;
    const servicesJson = body.servicesJson ?? "[]";

    const systemPrompt = buildAssistantSystemPrompt({
      name: body.name,
      greeting,
      hoursJson,
      servicesJson,
    });

    const config = buildVapiAssistantConfig({
      businessName: body.name,
      systemPrompt,
      greeting,
      webhookUrl: getWebhookUrl("/api/webhooks/vapi"),
      webhookSecret: process.env.VAPI_WEBHOOK_SECRET,
    });
    /* Vapi has no idempotency keys, so the assistant carries the shop's tag: a retry after a lost reply or a failed save finds it instead of making a second one. */
    const correlationKey = staffReceptionistKey(slug);
    const assistant = await performOnce<{ id: string }>({
      provider: "vapi",
      operation: "receptionist create (staff)",
      correlationKey,
      kind: "create",
      replayWindowMs: 0,
      perform: () => createAssistant({ ...config, metadata: { orviusConfig: config.metadata?.orviusConfig ?? "", orviusEffect: correlationKey } }),
      idOf: (created) => created.id,
      retrieve: async (id) => ({ id }),
      find: async () => {
        const rows = await vapiRequest<Array<{ id: string; metadata?: { orviusEffect?: string } }>>("/assistant?limit=1000");
        if (rows.length >= 1000) throw new Error("too many assistants to rule it out");
        return rows.find((row) => row.metadata?.orviusEffect === correlationKey) ?? null;
      },
      finalize: async () => undefined,
    });

    const business = await prisma.$transaction(async (tx) => {
      const created = await tx.business.create({
      data: {
        name: body.name,
        slug,
        phone: body.phone || null,
        ownerPhone: body.ownerPhone.trim(),
        ownerEmail: body.ownerEmail || null,
        timezone: body.timezone ?? "America/New_York",
        greeting,
        hoursJson,
        servicesJson,
        twilioPhone: null,
        vapiPhoneNumber: null,
        vapiAssistantId: assistant.id,
        ...networkForNewShop(null),
      },
      });
      await recordSettledActivation(tx, created.id, settled);
      return created;
    });

    assertCustomerShopLine({ phone: null, business });

    const { business: provisioned } = await ensureDedicatedShopLine(business);
    await recordPlatformAudit(await privilegedActor(request), {
      action: "admin.shop.created",
      summary: `Created ${business.name} (${slug})`,
      businessId: business.id,
      detail: { slug, operator: ack?.operator ?? null },
    });

    return NextResponse.json(provisioned, { status: 201 });
  } catch (error) {
    console.error("Create business failed:", error);
    const message =
      error instanceof z.ZodError
        ? error.errors.map((e) => e.message).join(", ")
        : error instanceof Error
          ? error.message
          : "Failed to create business";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await denyUnlessPrivileged(request);
  if (denied) return denied;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing business id" }, { status: 400 });
  }

  const business = await prisma.business.findUnique({ where: { id } });
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const line = await releaseShopLine(business);

  await prisma.business.delete({ where: { id } });
  await revertEffect("vapi", staffReceptionistKey(business.slug));
  await recordPlatformAudit(await privilegedActor(request), {
    action: "admin.shop.deleted",
    summary: `Deleted ${business.name} (${business.slug})`,
    businessId: business.id,
    detail: { slug: business.slug, name: business.name },
  });
  return NextResponse.json({ ok: true, line });
}

export async function PATCH(request: NextRequest) {
  const denied = await denyUnlessPrivileged(request);
  if (denied) return denied;

  try {
    const body = createBusinessSchema
      .partial()
      .extend({ id: z.string() })
      .parse(await request.json());

    const existing = await prisma.business.findUnique({
      where: { id: body.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const greeting = body.greeting ?? existing.greeting;
    const hoursJson = body.hoursJson ?? existing.hoursJson;
    const servicesJson = body.servicesJson ?? existing.servicesJson;
    const nextName = body.name ?? existing.name;

    const business = await prisma.business.update({
      where: { id: body.id },
      data: {
        name: nextName,
        phone: body.phone ?? existing.phone,
        ownerPhone: body.ownerPhone ?? existing.ownerPhone,
        ownerEmail: body.ownerEmail ?? existing.ownerEmail,
        timezone: body.timezone ?? existing.timezone,
        greeting: greeting ?? existing.greeting,
        hoursJson,
        servicesJson,
      },
    });

    if (business.vapiAssistantId) await syncBusinessAssistant(business);
    const changed = Object.keys(body).filter((key) => key !== "id" && key !== "acknowledgement");
    await recordPlatformAudit(await privilegedActor(request), {
      action: "admin.shop.updated",
      summary: `Updated ${business.name}: ${changed.join(", ") || "no fields"}`,
      businessId: business.id,
      detail: { fields: changed },
    });

    return NextResponse.json(business);
  } catch (error) {
    console.error("Update business failed:", error);
    const message =
      error instanceof Error ? error.message : "Failed to update business";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
