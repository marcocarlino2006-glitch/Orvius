import { NextResponse } from "next/server";
import { exportCustomerData } from "@/lib/customer-data-export";
import { requirePermission } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

/** A customer's own copy of what the shop holds about them; works on a lapsed plan, like the shop export. */
export async function GET(_request: Request, { params }: Params) {
  const authResult = await requirePermission("data.export", { entitled: false });
  if ("error" in authResult) return authResult.error;
  const { business, email, role } = authResult;
  const { id } = await params;

  const data = await exportCustomerData({ businessId: business.id, customerId: id, actorEmail: email, role });
  if (!data) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const day = data.exportedAt.slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="customer-data-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
