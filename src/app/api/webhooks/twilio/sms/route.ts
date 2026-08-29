import { NextRequest, NextResponse } from "next/server";
import { linkTouchToCustomer } from "@/lib/customer";
import { prisma } from "@/lib/prisma";
import { notifyOwner } from "@/lib/notifications";

const SMS_REPLY =
  "Thanks for contacting us! We received your message and will get back to you shortly. For urgent service, call us directly.";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const from = String(form.get("From") ?? "");
  const to = String(form.get("To") ?? "");
  const body = String(form.get("Body") ?? "").trim();

  if (!from || !to || !body) {
    return twimlResponse("");
  }

  const business = await prisma.business.findFirst({
    where: {
      isActive: true,
      OR: [{ twilioPhone: to }, { vapiPhoneNumber: to }],
    },
  });

  if (!business) {
    console.warn("SMS received but no business matched", { from, to });
    return twimlResponse(
      "Thanks for your message. We'll follow up as soon as possible.",
    );
  }

  const lead = await prisma.lead.create({
    data: {
      businessId: business.id,
      phone: from,
      notes: body,
      serviceType: "SMS inquiry",
      source: "sms",
      status: "new",
    },
  });

  await linkTouchToCustomer({
    businessId: business.id,
    leadId: lead.id,
    phone: from,
    notes: body,
  });

  await notifyOwner({
    ownerPhone: business.ownerPhone,
    ownerEmail: business.ownerEmail,
    businessName: business.name,
    message: [
      "New SMS lead",
      `From: ${from}`,
      `Message: ${body}`,
      `Lead ID: ${lead.id}`,
    ].join("\n"),
  });

  return twimlResponse(SMS_REPLY);
}

function twimlResponse(message: string) {
  const twiml = message
    ? `<Response><Message>${escapeXml(message)}</Message></Response>`
    : "<Response></Response>";

  return new NextResponse(twiml, {
    headers: { "Content-Type": "text/xml" },
  });
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Twilio may validate with GET in some setups
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "twilio-sms-webhook" });
}
