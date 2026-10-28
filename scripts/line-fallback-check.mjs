#!/usr/bin/env node
/**
 * Reads every shop line back from Twilio and says which would play Twilio's
 * error tone instead of ringing the shop if the AI were down.
 *
 *   npm run lines:check            read only, exits 1 if any line is unprotected
 *   npm run lines:check -- --fix   sets the fallback on those lines, then re-reads
 *
 * The same check runs from the Calls card in /admin, with no local credentials.
 * Here it needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and DATABASE_URL.
 */
import { lineFallbackReport } from "../src/lib/line-fallback-report.ts";
import { prisma } from "../src/lib/prisma.ts";

try {
  const report = await lineFallbackReport({ fix: process.argv.includes("--fix") });
  console.log(`Expected fallback: ${report.expected}\n`);
  for (const line of report.lines) {
    console.log(`${line.status.padEnd(15)} ${line.phone}  ${line.shop ?? ""}  AI route: ${line.aiRoute}`);
  }
  console.log("");
  if (report.notOnAccount) console.log(`${report.notOnAccount} line(s) are not on this Twilio account, so they cannot be verified here.`);
  if (report.notVapi) console.log(`${report.notVapi} line(s) do not route to Vapi: check them before trusting a call to be answered.`);
  if (report.unprotected) {
    console.log(`${report.unprotected} line(s) have no fallback. A caller would hear Twilio's error tone if the AI were down.`);
    process.exitCode = 1;
  } else {
    console.log("Every verifiable line has the fallback.");
  }
} finally {
  await prisma.$disconnect();
}
