import { recordAudit } from "@/lib/audit";
import { company } from "@/lib/company";
import { normalizePhone } from "@/lib/customer";
import { isEmailConfigured, sendOwnerEmail } from "@/lib/email";
import { logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { sealSecret, secretBoxConfigured } from "@/lib/secret-box";
import { sendSms } from "@/lib/twilio-sms";

export type PortInput = {
  number: string;
  carrier: string;
  accountName: string;
  accountNumber: string;
  pin?: string;
  serviceAddress: string;
  authorizedName: string;
};

export const PORT_STATUS_COPY: Record<string, string> = {
  received: "Received. Orvius files it with the carriers and texts you the date they set.",
  filed: "Filed with the carriers. They set the date; keep your current service until then.",
  scheduled: "Scheduled. Keep your current service and forwarding until the port date.",
  done: "Done. Your number now rings Orvius directly.",
  failed: "The carriers turned it down. Fix the details and send again.",
};

/** The port-out PIN is only asked for when it can be sealed at rest. */
export function portPinAccepted() {
  return secretBoxConfigured();
}

export function validatePortInput(input: Partial<Record<keyof PortInput, unknown>>):
  | { ok: true; value: PortInput & { number: string } }
  | { ok: false; errors: Partial<Record<keyof PortInput, string>> } {
  const s = (k: keyof PortInput) => (typeof input[k] === "string" ? (input[k] as string).trim().slice(0, 200) : "");
  const errors: Partial<Record<keyof PortInput, string>> = {};
  const number = normalizePhone(s("number"));
  if (!number || !/^\+1[2-9]\d{9}$/.test(number)) errors.number = "The US number customers call now.";
  const carrier = s("carrier");
  if (carrier.length < 2) errors.carrier = "Who you pay for that number.";
  const accountName = s("accountName");
  if (accountName.length < 2) errors.accountName = "Exactly as it appears on the bill.";
  const accountNumber = s("accountNumber");
  if (accountNumber.replace(/\W/g, "").length < 4) errors.accountNumber = "From the bill or your carrier's app.";
  const pin = s("pin");
  if (portPinAccepted() && pin && !/^[A-Za-z0-9]{4,15}$/.test(pin)) errors.pin = "Letters and digits only.";
  const serviceAddress = s("serviceAddress");
  if (serviceAddress.length < 8) errors.serviceAddress = "The service address on the bill.";
  const authorizedName = s("authorizedName");
  if (authorizedName.length < 3) errors.authorizedName = "The person allowed to make changes on the account.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { number: number!, carrier, accountName, accountNumber, pin: pin || undefined, serviceAddress, authorizedName },
  };
}

/** Saves the request and tells Orvius ops; a refused request can be sent again. */
export async function submitPortRequest(
  business: { id: string; name: string; ownerEmail: string | null; twilioPhone: string | null },
  value: PortInput,
) {
  const existing = await prisma.portRequest.findUnique({ where: { businessId: business.id } });
  if (existing && existing.status !== "failed") throw new Error("A port request is already in progress.");
  const data = {
    number: value.number,
    carrier: value.carrier,
    accountName: value.accountName,
    accountNumber: value.accountNumber,
    pinSealed: value.pin && portPinAccepted() ? sealSecret(value.pin) : null,
    serviceAddress: value.serviceAddress,
    authorizedName: value.authorizedName,
    status: "received",
    portDate: null,
    note: null,
  };
  const row = await prisma.portRequest.upsert({
    where: { businessId: business.id },
    create: { businessId: business.id, ...data },
    update: data,
  });
  await recordAudit({
    businessId: business.id,
    entityType: "shop",
    entityId: business.id,
    action: "port.requested",
    actor: "owner",
    summary: `Asked to move ${value.number} from ${value.carrier} to Orvius`,
    idempotencyKey: `port-requested:${row.id}:${row.updatedAt.getTime()}`,
  });
  if (isEmailConfigured()) {
    await sendOwnerEmail({
      to: company.contactEmail,
      subject: `Port request: ${business.name} (${value.number})`,
      text: [
        `${business.name} asked to port ${value.number} from ${value.carrier} onto ${business.twilioPhone ?? "its Orvius line"}.`,
        `Account name: ${value.accountName}`,
        `Account number: ${value.accountNumber}`,
        `Service address: ${value.serviceAddress}`,
        `Authorized person: ${value.authorizedName}`,
        `PIN: ${data.pinSealed ? "sealed in the request" : "not collected — ask the owner"}`,
        `Owner email: ${business.ownerEmail ?? "none"}`,
        `Request id: ${row.id}`,
      ].join("\n"),
    }).catch((error: unknown) => {
      logWarn("port_request.ops_email_failed", { error: error instanceof Error ? error.message : "unknown" });
    });
  }
  return row;
}

export const PORT_STATUSES = ["received", "filed", "scheduled", "done", "failed"] as const;
export type PortStatus = (typeof PORT_STATUSES)[number];

/** Ops moves a request along; the owner is texted when there is something to act on. */
export async function updatePortRequest(params: { id: string; status: PortStatus; portDate?: Date | null; note?: string | null }) {
  const row = await prisma.portRequest.update({
    where: { id: params.id },
    data: {
      status: params.status,
      ...(params.portDate !== undefined ? { portDate: params.portDate } : {}),
      ...(params.note !== undefined ? { note: params.note?.slice(0, 500) ?? null } : {}),
    },
    include: { business: { select: { id: true, name: true, ownerPhone: true, timezone: true } } },
  });
  await recordAudit({
    businessId: row.businessId,
    entityType: "shop",
    entityId: row.businessId,
    action: `port.${params.status}`,
    actor: "system",
    summary: `Port of ${row.number}: ${params.status}${row.portDate ? ` for ${row.portDate.toISOString().slice(0, 10)}` : ""}`,
    idempotencyKey: `port:${row.id}:${params.status}:${row.portDate?.getTime() ?? ""}`,
  });
  const when = row.portDate
    ? row.portDate.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: row.business.timezone ?? "America/New_York",
      })
    : null;
  const body =
    params.status === "scheduled" && when
      ? `Orvius: ${row.number} moves to Orvius on ${when}. Keep your current service and forwarding until then.`
      : params.status === "done"
        ? `Orvius: ${row.number} now rings Orvius directly. You can cancel that line with ${row.carrier}.`
        : params.status === "failed"
          ? `Orvius: ${row.carrier} turned down the move of ${row.number}${row.note ? `: ${row.note}` : ""}. Fix it in Settings → Phone and send again.`
          : null;
  if (body && row.business.ownerPhone) {
    await sendSms({ to: row.business.ownerPhone, body, businessId: row.businessId, audience: "owner" }).catch(
      (error: unknown) => logWarn("port_request.owner_sms_failed", { error: error instanceof Error ? error.message : "unknown" }),
    );
  }
  return row;
}
