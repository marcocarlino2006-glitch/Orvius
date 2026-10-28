import { auditLineFallback, unprotectedLines, expectedVoiceFallbackUrl, type LineFallbackRow } from "@/lib/line-fallback";
import { prisma } from "@/lib/prisma";
import { getTwilioClient } from "@/lib/twilio-client";

export type LineFallbackReport = {
  expected: string;
  lines: Array<LineFallbackRow & { shop: string | null }>;
  unprotected: number;
  notOnAccount: number;
  notVapi: number;
};

/** Every shop line read back from Twilio, optionally repaired, with the shop it belongs to. */
export async function lineFallbackReport(options: { fix?: boolean } = {}): Promise<LineFallbackReport> {
  const shops = await prisma.business.findMany({
    where: { OR: [{ vapiPhoneNumber: { not: null } }, { twilioPhone: { not: null } }] },
    select: { name: true, vapiPhoneNumber: true, twilioPhone: true },
  });
  const owners = new Map<string, string>();
  for (const shop of shops) {
    const phone = shop.vapiPhoneNumber ?? shop.twilioPhone;
    if (phone && !owners.has(phone)) owners.set(phone, shop.name);
  }

  const client = getTwilioClient();
  const phones = [...owners.keys()];
  if (options.fix) await auditLineFallback(phones, client as never, { fix: true });
  const rows = await auditLineFallback(phones, client as never);

  return {
    expected: expectedVoiceFallbackUrl(),
    lines: rows.map((row) => ({ ...row, shop: owners.get(row.phone) ?? null })),
    unprotected: unprotectedLines(rows).length,
    notOnAccount: rows.filter((r) => r.status === "not_on_account").length,
    notVapi: rows.filter((r) => r.status !== "not_on_account" && r.aiRoute !== "vapi").length,
  };
}
