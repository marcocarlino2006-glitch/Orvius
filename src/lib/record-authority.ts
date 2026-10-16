import { getRecordContract, type RecordContract, type RecordDomain, type RecordSystem } from "@/lib/system-of-record";

/*
  Whether Orvius may write a part of a shop's record into another system, read
  from the shop's record contract at the moment of the write (not when the work
  was queued). Allowed when that system is the record of truth for the part,
  when the owner listed it as a copy, or, for a shop that never set a contract,
  because the owner connected it before contracts existed: what they set up
  keeps running until they decide otherwise.
*/

export const SYSTEM_LABEL: Record<string, string> = {
  orvius: "Orvius",
  jobber: "Jobber",
  housecall: "Housecall Pro",
  servicetitan: "ServiceTitan",
  quickbooks: "QuickBooks",
  stripe: "Stripe",
  google_calendar: "Google Calendar",
  twilio: "Twilio",
};

const DOMAIN_LABEL: Record<RecordDomain, string> = {
  customer: "customers",
  availability: "availability",
  job_state: "jobs",
  price_invoice: "prices and invoices",
  payment_receipt: "payments and receipts",
  notifications: "notifications",
};

export type WriteDecision =
  | { allowed: true; basis: "record_of_truth" | "authorized_copy" | "connected_before_contract"; contractVersion: number }
  | { allowed: false; contractVersion: number; recordOfTruth: RecordSystem; reason: string };

export function decideWrite(contract: RecordContract, system: RecordSystem, domain: RecordDomain): WriteDecision {
  const owner = contract.domains[domain];
  if (owner === system) return { allowed: true, basis: "record_of_truth", contractVersion: contract.version };
  if (contract.replicas[domain]?.includes(system)) return { allowed: true, basis: "authorized_copy", contractVersion: contract.version };
  if (contract.implicit) return { allowed: true, basis: "connected_before_contract", contractVersion: contract.version };
  return {
    allowed: false,
    contractVersion: contract.version,
    recordOfTruth: owner,
    reason: `Not sent: ${SYSTEM_LABEL[owner] ?? owner} is the record of truth for ${DOMAIN_LABEL[domain]} (record contract v${contract.version}), and ${SYSTEM_LABEL[system] ?? system} isn't listed as a copy.`,
  };
}

export async function mayWrite(businessId: string, system: RecordSystem, domain: RecordDomain): Promise<WriteDecision> {
  return decideWrite(await getRecordContract(businessId), system, domain);
}

/**
 * Which connected system to read a part of the record from. The record of
 * truth when it is connected; otherwise the first connected copy the owner
 * listed; otherwise the given fallback order. Reading busy time only ever
 * blocks times, so a shop with no say still reads what it connected.
 */
export function pickReadSource<S extends RecordSystem>(contract: RecordContract, domain: RecordDomain, connected: S[], fallbackOrder: S[]): S | null {
  const owner = contract.domains[domain];
  if ((connected as RecordSystem[]).includes(owner)) return owner as S;
  for (const copy of contract.replicas[domain] ?? []) if ((connected as RecordSystem[]).includes(copy)) return copy as S;
  return fallbackOrder.find((s) => connected.includes(s)) ?? null;
}
