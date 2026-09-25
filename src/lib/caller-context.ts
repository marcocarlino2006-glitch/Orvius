import { describeSlot } from "@/lib/in-call-tool-defs";
import { logWarn } from "@/lib/logger";
import { normalizePhone } from "@/lib/customer";
import { prisma } from "@/lib/prisma";

/**
 * A returning caller should not have to start from zero. When a call
 * connects, the live receptionist gets a private note about who usually
 * calls from this number and what the shop last did for them.
 *
 * A phone number is not a person — spouses, landlords and tenants share
 * lines — so the note tells the receptionist to confirm before using it and
 * never to read an address or history back to someone who hasn't confirmed.
 */

type JobRef = { title: string | null; scheduledAt: Date | null; status: string; address: string | null };

export type CallerContextInput = {
  name: string | null;
  interactionCount: number;
  timezone: string;
  lastJob: JobRef | null;
  openJob: JobRef | null;
};

function firstName(name: string | null) {
  const first = name?.trim().split(/\s+/)[0];
  return first && first.length > 1 ? first : null;
}

export function buildCallerContextNote(input: CallerContextInput): string | null {
  if (input.interactionCount < 2 && !input.lastJob && !input.openJob) return null;
  const who = firstName(input.name);
  const lines = [
    "Private note, never read this aloud: this number has called the shop before.",
    who
      ? `It is usually ${input.name!.trim()}. You may ask "Is this ${who}?" Only use the details below after they confirm.`
      : "Their name is not on file. Ask for it as usual.",
  ];
  if (input.openJob) {
    const when = input.openJob.scheduledAt ? ` on ${describeSlot(input.openJob.scheduledAt, input.timezone)}` : "";
    lines.push(
      `They have an open job: ${input.openJob.title ?? "a service visit"}${when} (${input.openJob.status}). If they are calling about it, help with that instead of booking new work.`,
    );
  }
  if (input.lastJob) {
    const when = input.lastJob.scheduledAt
      ? ` on ${new Intl.DateTimeFormat("en-US", { timeZone: input.timezone, month: "long", day: "numeric", year: "numeric" }).format(input.lastJob.scheduledAt)}`
      : "";
    lines.push(`Last visit: ${input.lastJob.title ?? "a service visit"}${when}.`);
  }
  const address = input.openJob?.address ?? input.lastJob?.address;
  if (address) {
    lines.push(
      `Address on file: ${address}. Once they confirm who they are, ask "Is this for ${address}?" instead of asking for the address from scratch. Never say the address to someone who has not confirmed their name.`,
    );
  }
  return lines.join(" ");
}

const OPEN = ["scheduled", "confirmed", "en_route", "on_site"];

export async function loadCallerContextNote(params: {
  businessId: string;
  phone: string;
  timezone: string;
}): Promise<string | null> {
  const phoneNormalized = normalizePhone(params.phone);
  if (!phoneNormalized) return null;
  const customer = await prisma.customer.findUnique({
    where: { businessId_phoneNormalized: { businessId: params.businessId, phoneNormalized } },
    select: {
      name: true,
      interactionCount: true,
      jobs: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { title: true, scheduledAt: true, status: true, address: true },
      },
    },
  });
  if (!customer) return null;
  const openJob = customer.jobs.find((job) => OPEN.includes(job.status)) ?? null;
  const lastJob = customer.jobs.find((job) => job.status === "completed") ?? null;
  return buildCallerContextNote({
    name: customer.name,
    interactionCount: customer.interactionCount,
    timezone: params.timezone,
    lastJob,
    openJob,
  });
}

/** Hands the note to the live call without making the receptionist speak. */
export async function sendCallerContext(controlUrl: string, note: string) {
  try {
    const res = await fetch(controlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "add-message",
        message: { role: "system", content: note },
        triggerResponseEnabled: false,
      }),
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch (error) {
    logWarn("vapi.caller_context.failed", { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}
