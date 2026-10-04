import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminRequest } from "@/lib/env";
import { PORT_STATUSES, updatePortRequest } from "@/lib/port-request";
import { prisma } from "@/lib/prisma";
import { openSecret } from "@/lib/secret-box";

/** Open requests to file; `?id=` returns one with its PIN for filing. */
export async function GET(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (id) {
    const row = await prisma.portRequest.findUnique({ where: { id }, include: { business: { select: { name: true, twilioPhone: true, ownerEmail: true } } } });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { pinSealed, ...rest } = row;
    return NextResponse.json({ request: { ...rest, pin: openSecret(pinSealed) } });
  }
  const rows = await prisma.portRequest.findMany({
    where: { status: { in: ["received", "filed", "scheduled"] } },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: { id: true, number: true, carrier: true, status: true, portDate: true, createdAt: true, business: { select: { name: true } } },
  });
  return NextResponse.json({ requests: rows });
}

const updateSchema = z.object({
  id: z.string().min(5),
  status: z.enum(PORT_STATUSES),
  portDate: z.string().datetime().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export async function POST(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors.map((e) => e.message).join(", ") }, { status: 400 });
  const { portDate, ...rest } = parsed.data;
  const row = await updatePortRequest({ ...rest, portDate: portDate === undefined ? undefined : portDate ? new Date(portDate) : null });
  return NextResponse.json({ ok: true, id: row.id, status: row.status });
}
