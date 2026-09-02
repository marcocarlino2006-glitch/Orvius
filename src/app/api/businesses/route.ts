import { NextRequest, NextResponse } from "next/server";
import { buildAssistantSystemPrompt, slugify } from "@/lib/business";
import { assertCustomerShopLine } from "@/lib/demo-business";
import { getWebhookUrl, verifyAdminRequest } from "@/lib/env";
import {
  ensureDedicatedShopLine,
  DEFAULT_HOURS_JSON,
} from "@/lib/provision-business";
import { prisma } from "@/lib/prisma";
import {
  buildVapiAssistantConfig,
  createAssistant,
  deleteAssistant,
  updateAssistant,
} from "@/lib/vapi";
import { z } from "zod";

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
});

export async function GET(request: NextRequest) {
  if (!verifyAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const businesses = await prisma.business.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { calls: true, leads: true },
      },
    },
  });

  return NextResponse.json(businesses);
}

export async function POST(request: NextRequest) {
  if (!verifyAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    const greeting =
      body.greeting ?? `Thank you for calling ${body.name}. How can I help you today?`;
    const hoursJson = body.hoursJson ?? DEFAULT_HOURS_JSON;
    const servicesJson = body.servicesJson ?? "[]";

    const systemPrompt = buildAssistantSystemPrompt({
      name: body.name,
      greeting,
      hoursJson,
      servicesJson,
    });

    const assistant = await createAssistant(
      buildVapiAssistantConfig({
        businessName: body.name,
        systemPrompt,
        greeting,
        webhookUrl: getWebhookUrl("/api/webhooks/vapi"),
        webhookSecret: process.env.VAPI_WEBHOOK_SECRET,
      }),
    );

    const business = await prisma.business.create({
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
      },
    });

    assertCustomerShopLine({ phone: null, business });

    const { business: provisioned } = await ensureDedicatedShopLine(business);

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
  if (!verifyAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing business id" }, { status: 400 });
  }

  const business = await prisma.business.findUnique({ where: { id } });
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  if (business.vapiAssistantId) {
    try {
      await deleteAssistant(business.vapiAssistantId);
    } catch (error) {
      console.error("Failed to delete Vapi assistant:", error);
    }
  }

  await prisma.business.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  if (!verifyAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    const systemPrompt = buildAssistantSystemPrompt({
      name: nextName,
      greeting:
        greeting ??
        `Thank you for calling ${nextName}. How can I help you today?`,
      hoursJson,
      servicesJson,
    });

    if (existing.vapiAssistantId) {
      await updateAssistant(existing.vapiAssistantId, {
        name: `${nextName} Receptionist`,
        firstMessage:
          greeting ??
          `Thank you for calling ${nextName}. How can I help you today?`,
        model: {
          provider: "openai",
          model: "gpt-4o",
          messages: [{ role: "system", content: systemPrompt }],
        },
        serverUrl: getWebhookUrl("/api/webhooks/vapi"),
        serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
      });
    }

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

    return NextResponse.json(business);
  } catch (error) {
    console.error("Update business failed:", error);
    const message =
      error instanceof Error ? error.message : "Failed to update business";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
