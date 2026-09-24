import { NextResponse } from "next/server";
import { isRecordType } from "@/lib/record-types";
import { getRecordView } from "@/lib/record-view";
import { requireEntitledSession } from "@/lib/tenant";

type Params = { params: Promise<{ type: string; id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const { type, id } = await params;
  if (!isRecordType(type)) {
    return NextResponse.json({ error: "Unknown record type" }, { status: 400 });
  }

  const record = await getRecordView(business.id, type, id);
  if (!record) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }
  return NextResponse.json({ record });
}
