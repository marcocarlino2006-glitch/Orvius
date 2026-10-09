import { NextResponse } from "next/server";
import { FieldError } from "@/lib/job-field";
import { signatureFile } from "@/lib/job-signature";
import { withOffice } from "@/lib/office-route";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  return withOffice("jobs", async ({ business }) => {
    const file = await signatureFile(business.id, id);
    if (!file) throw new FieldError("Not signed yet", 404);
    return new NextResponse(Buffer.from(file.png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  });
}
