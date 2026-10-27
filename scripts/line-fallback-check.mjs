#!/usr/bin/env node
/**
 * Reads every shop line back from Twilio and says which would play Twilio's
 * error tone instead of ringing the shop if the AI were down.
 *
 *   npm run lines:check            read only, exits 1 if any line is unprotected
 *   npm run lines:check -- --fix   sets the fallback on those lines, then re-reads
 *
 * Needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, DATABASE_URL (and APP_URL so the
 * expected fallback address is the production one).
 */
import { PrismaClient } from "@prisma/client";

import { auditLineFallback, expectedVoiceFallbackUrl, unprotectedLines } from "../src/lib/line-fallback.ts";
import { getTwilioClient } from "../src/lib/twilio-client.ts";

const fix = process.argv.includes("--fix");
const prisma = new PrismaClient();

try {
  const shops = await prisma.business.findMany({
    where: { OR: [{ vapiPhoneNumber: { not: null } }, { twilioPhone: { not: null } }] },
    select: { name: true, vapiPhoneNumber: true, twilioPhone: true },
  });
  const owners = new Map();
  for (const shop of shops) {
    const phone = shop.vapiPhoneNumber ?? shop.twilioPhone;
    if (phone && !owners.has(phone)) owners.set(phone, shop.name);
  }

  console.log(`Expected fallback: ${expectedVoiceFallbackUrl()}`);
  console.log(`Lines: ${owners.size}${fix ? " (fixing)" : ""}\n`);

  const client = getTwilioClient();
  let rows = await auditLineFallback([...owners.keys()], client, { fix });
  for (const row of rows) {
    console.log(`${row.status.padEnd(15)} ${row.phone}  ${owners.get(row.phone)}  AI route: ${row.aiRoute}`);
  }

  if (fix) rows = await auditLineFallback([...owners.keys()], client);
  const open = unprotectedLines(rows);
  const noAi = rows.filter((r) => r.status !== "not_on_account" && r.aiRoute !== "vapi");
  const foreign = rows.filter((r) => r.status === "not_on_account");

  console.log("");
  if (foreign.length) console.log(`${foreign.length} line(s) are not on this Twilio account, so they cannot be verified here.`);
  if (noAi.length) console.log(`${noAi.length} line(s) do not route to Vapi: check them before trusting a call to be answered.`);
  if (open.length) {
    console.log(`${open.length} line(s) have no fallback. A caller would hear Twilio's error tone if the AI were down.`);
    process.exitCode = 1;
  } else {
    console.log("Every verifiable line has the fallback.");
  }
} finally {
  await prisma.$disconnect();
}
