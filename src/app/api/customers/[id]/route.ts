import { NextResponse } from "next/server";
import { z } from "zod";
import { getCustomerProperties, getCustomerTimeline, customerDisplayName } from "@/lib/customer";
import { parseAddresses, parseEquipment, serializeAddresses, serializeEquipment } from "@/lib/customer-record";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { requireEntitledSession } from "@/lib/tenant";
import { recordAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "customers");
  if ("error" in planGate) return planGate.error;

  const { id } = await params;

  const customer = await prisma.customer.findFirst({
    where: { id, businessId: business.id },
    include: {
      business: { select: { id: true, name: true } },
      _count: { select: { leads: true, calls: true, jobs: true } },
    },
  });

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const [timeline, properties] = await Promise.all([
    getCustomerTimeline(id),
    getCustomerProperties(id, customer.address),
  ]);

  return NextResponse.json({
    customer: {
      id: customer.id,
      name: customer.name,
      displayName: customerDisplayName(customer.name, customer.phone),
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      addresses: parseAddresses(customer.addressesJson),
      equipment: parseEquipment(customer.equipmentJson),
      notes: customer.notes,
      interactionCount: customer.interactionCount,
      // Records backfilled onto a customer can predate the customer row itself.
      firstSeenAt: timeline.reduce(
        (earliest, event) => (event.at < earliest ? event.at : earliest),
        customer.firstSeenAt.toISOString(),
      ),
      lastSeenAt: customer.lastSeenAt.toISOString(),
      business: customer.business,
      leadCount: customer._count.leads,
      callCount: customer._count.calls,
      jobCount: customer._count.jobs,
      returning:
        customer.interactionCount > 1 ||
        customer._count.leads > 1 ||
        customer._count.calls > 1 ||
        customer._count.jobs > 1,
    },
    timeline,
    properties,
  });
}

const patchBody = z.object({
  address: z.string().max(200).nullable().optional(),
  email: z.string().email().max(120).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  addresses: z
    .array(z.object({ label: z.string().max(40).optional(), line: z.string().min(1).max(200) }))
    .max(8)
    .optional(),
  equipment: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        brand: z.string().max(200).optional(),
        model: z.string().max(200).optional(),
        notes: z.string().max(200).optional(),
      }),
    )
    .max(20)
    .optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business, email } = authResult;
  const planGate = requirePlanModule(business, "customers");
  if ("error" in planGate) return planGate.error;

  const { id } = await params;
  const existing = await prisma.customer.findFirst({ where: { id, businessId: business.id } });
  if (!existing) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const parsed = patchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the address or equipment and try again." }, { status: 400 });

  const data: {
    address?: string | null;
    email?: string | null;
    notes?: string | null;
    addressesJson?: string;
    equipmentJson?: string;
  } = {};
  if (parsed.data.address !== undefined) data.address = parsed.data.address?.trim() || null;
  if (parsed.data.email !== undefined) data.email = parsed.data.email;
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes?.trim() || null;
  if (parsed.data.addresses) data.addressesJson = serializeAddresses(parsed.data.addresses.map((row) => ({ label: row.label ?? "Other", line: row.line })));
  if (parsed.data.equipment) {
    data.equipmentJson = serializeEquipment(
      parsed.data.equipment.map((row) => ({
        name: row.name,
        brand: row.brand ?? "",
        model: row.model ?? "",
        notes: row.notes ?? "",
      })),
    );
  }

  const customer = await prisma.customer.update({ where: { id: existing.id }, data });
  await recordAudit({
    businessId: business.id,
    entityType: "customer",
    entityId: customer.id,
    action: "customer.updated",
    actor: "owner",
    actorEmail: email,
    summary: "Updated the customer record",
  });

  return NextResponse.json({
    addresses: parseAddresses(customer.addressesJson),
    equipment: parseEquipment(customer.equipmentJson),
    address: customer.address,
  });
}
