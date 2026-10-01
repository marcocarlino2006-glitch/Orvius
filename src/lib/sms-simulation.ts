import { randomUUID } from "node:crypto";
import { normalizePhone } from "@/lib/customer";
import { prisma } from "@/lib/prisma";
import { isFictionalPhone } from "@/lib/workspace-hygiene";

/**
 * A demo workspace runs the whole loop — confirmations, tech texts, owner
 * alerts — without a carrier. Its texts are written where a real send would
 * be written, under a SIM_ id, so the trail reads the same and nothing leaves
 * the building. Demo phone numbers are fictional, so a real send would text a
 * stranger or fail.
 */
export const SIMULATED_SID_PREFIX = "SIM_";

/** The demo number the simulated carrier refuses, so a failed text can be shown end to end. */
export const SIMULATED_UNDELIVERABLE_PHONE = "+13125550100";

export class SimulatedCarrierRejection extends Error {
  constructor(to: string) {
    super(`Simulated carrier rejected the text to ${to} (number cannot receive SMS)`);
    this.name = "SimulatedCarrierRejection";
  }
}

/** A demo shop wired to a real line (the public demo number) still texts for real. */
export async function isSimulatedWorkspace(businessId: string | null | undefined): Promise<boolean> {
  if (!businessId) return false;
  const shop = await prisma.business.findUnique({
    where: { id: businessId },
    select: { environment: true, vapiPhoneNumber: true, twilioPhone: true },
  });
  if (shop?.environment !== "demo") return false;
  const line = shop.vapiPhoneNumber ?? shop.twilioPhone;
  return !line || isFictionalPhone(line);
}

export function isSimulatedSid(sid: string | null | undefined): boolean {
  return Boolean(sid?.startsWith(SIMULATED_SID_PREFIX));
}

export function simulatedSid(): string {
  return `${SIMULATED_SID_PREFIX}${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

/** Throws for the reserved undeliverable number, like Twilio does for a landline. */
export function simulateSend(to: string): { sid: string } {
  if (normalizePhone(to) === SIMULATED_UNDELIVERABLE_PHONE) throw new SimulatedCarrierRejection(to);
  return { sid: simulatedSid() };
}
