import { NextResponse } from "next/server";
import {
  confirmJobByCustomerToken,
  declineJobByCustomerToken,
  previewJobByCustomerToken,
  requestRescheduleByCustomerToken,
} from "@/lib/customer-confirm";

type Params = { params: Promise<{ token: string }> };

const ACTIONS = new Set(["confirm", "decline", "reschedule_request"]);

function jobJson(job: {
  id: string;
  title: string;
  scheduledAt: Date | null;
  businessName: string;
  status: string;
  confirmed?: boolean;
}) {
  return {
    ...job,
    scheduledAt: job.scheduledAt?.toISOString() ?? null,
  };
}

/** Preview only — never stamps confirm/decline. */
export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  if (!token?.trim()) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const result = await previewJobByCustomerToken(token.trim());
  if (!result.ok) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    state: result.state,
    job: jobJson(result.job),
  });
}

export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  if (!token?.trim()) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  let action = "confirm";
  try {
    const body = (await request.json()) as { action?: string };
    if (body?.action) action = String(body.action);
  } catch {
    /* empty body → confirm (legacy clients) */
  }

  if (!ACTIONS.has(action)) {
    return NextResponse.json(
      { error: "action must be confirm, decline, or reschedule_request" },
      { status: 400 },
    );
  }

  const trimmed = token.trim();
  const result =
    action === "decline"
      ? await declineJobByCustomerToken(trimmed)
      : action === "reschedule_request"
        ? await requestRescheduleByCustomerToken(trimmed)
        : await confirmJobByCustomerToken(trimmed);

  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "already_confirmed" ||
            result.error === "already_declined"
          ? 409
          : 400;
    return NextResponse.json(
      {
        error:
          result.error === "already_confirmed"
            ? "Already confirmed — cannot decline or reschedule from this link."
            : result.error === "already_declined"
              ? "This window was already declined."
              : "Link not found",
      },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    already: result.already,
    action: result.action,
    job: jobJson(result.job),
  });
}
