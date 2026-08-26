import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildVapiAssistantConfig,
  createAssistant,
  deleteAssistant,
  updateAssistant,
} from "@/lib/vapi";
import { buildAssistantSystemPrompt, slugify } from "@/lib/business";
import { z } from "zod";

const createBusinessSchema = z.object({
  name: z.string().min(2),
  slug: z.string().optional(),
  phone: z.string().optional(),
  ownerPhone: z.string().optional(),
  ownerEmail: z.string().email().optional().or(z.literal("")),
  timezone: z.string().optional(),
  greeting: z.string().optional(),
  hoursJson: z.string().optional(),
  servicesJson: z.string().optional(),
  twilioPhone: z.string().optional(),
  vapiPhoneNumber: z.string().optional(),
});

function getWebhookUrl(request: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  const origin = configured ?? request.nextUrl.origin;
  return `${origin}/api/webhooks/vapi`;
}

export async function GET() {
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

    const systemPrompt = buildAssistantSystemPrompt({
      name: body.name,
      greeting,
      hoursJson: body.hoursJson ?? "{}",
      servicesJson: body.servicesJson ?? "[]",
    });

    const assistant = await createAssistant(
      buildVapiAssistantConfig({
        businessName: body.name,
        systemPrompt,
        greeting,
        webhookUrl: getWebhookUrl(request),
        webhookSecret: process.env.VAPI_WEBHOOK_SECRET,
      }),
    );

    const business = await prisma.business.create({
      data: {
        name: body.name,
        slug,
        phone: body.phone || null,
        ownerPhone: body.ownerPhone || null,
        ownerEmail: body.ownerEmail || null,
        timezone: body.timezone ?? "America/New_York",
        greeting,
        hoursJson: body.hoursJson ?? "{}",
        servicesJson: body.servicesJson ?? "[]",
        twilioPhone: body.twilioPhone || null,
        vapiPhoneNumber: body.vapiPhoneNumber || null,
        vapiAssistantId: assistant.id,
      },
    });

    return NextResponse.json(business, { status: 201 });
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
  try {
    const body = createBusinessSchema
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

    const systemPrompt = buildAssistantSystemPrompt({
      name: body.name ?? existing.name,
      greeting:
        greeting ??
        `Thank you for calling ${body.name ?? existing.name}. How can I help you today?`,
      hoursJson,
      servicesJson,
    });

    if (existing.vapiAssistantId) {
      await updateAssistant(existing.vapiAssistantId, {
        name: `${body.name ?? existing.name} Receptionist`,
        firstMessage:
          greeting ??
          `Thank you for calling ${body.name ?? existing.name}. How can I help you today?`,
        model: {
          provider: "openai",
          model: "gpt-4o",
          messages: [{ role: "system", content: systemPrompt }],
        },
        serverUrl: getWebhookUrl(request),
        serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
      });
    }

    const business = await prisma.business.update({
      where: { id: body.id },
      data: {
        name: body.name ?? existing.name,
        phone: body.phone ?? existing.phone,
        ownerPhone: body.ownerPhone ?? existing.ownerPhone,
        ownerEmail: body.ownerEmail ?? existing.ownerEmail,
        timezone: body.timezone ?? existing.timezone,
        greeting: greeting ?? existing.greeting,
        hoursJson,
        servicesJson,
        twilioPhone: body.twilioPhone ?? existing.twilioPhone,
        vapiPhoneNumber: body.vapiPhoneNumber ?? existing.vapiPhoneNumber,
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
