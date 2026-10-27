#!/usr/bin/env node
/*
 * Two server processes book the same time for the same shop at the same
 * moment, against one SQLite file opened through the libSQL adapter (the same
 * adapter production uses on Turso). The rule under test: never more than one
 * job at that time. Raw file locking between two local processes also makes
 * some calls fail with a lock timeout; those are counted and shown, not a
 * pass or fail, because Turso's server arbitrates writers differently and
 * this file cannot speak for it. Local only: it makes its own scratch
 * database and never touches DATABASE_URL.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-alias.mjs scripts/two-process-race.mjs [rounds]
 */
import { execFileSync, spawn } from "node:child_process";
import { rmSync } from "node:fs";

const FILE = process.env.RACE_FILE ?? `/tmp/orvius-race-${process.pid}.db`;
const URL_ = `file:${FILE}`;
const role = process.argv[2];

if (role === "worker") {
  const [, , , startAt, businessId, scheduledAtIso, ...leadIds] = process.argv;
  process.env.DATABASE_URL = URL_;
  const { createJobFromLead, SlotTakenError } = await import("../src/lib/job.ts");
  while (Date.now() < Number(startAt)) await new Promise((r) => setTimeout(r, 1));
  const results = await Promise.all(
    leadIds.map(async (leadId) => {
      try {
        const job = await createJobFromLead({ leadId, scheduledAt: new Date(scheduledAtIso), enforceCapacity: true, skipAutoAssign: true });
        return { leadId, booked: job.id };
      } catch (error) {
        return { leadId, error: error instanceof SlotTakenError ? "slot_taken" : `${error?.name}|${error?.code ?? ""}|${error?.constructor?.name}|${JSON.stringify(error?.message ?? "").slice(0, 300)}|${String(error?.stack ?? "").split("\n").filter((l) => l.includes("/src/")).slice(0, 4).join(" <- ")}` };
      }
    }),
  );
  process.stdout.write(`RESULT ${JSON.stringify(results)}\n`);
  process.exit(0);
}

const rounds = Number(process.argv[2] ?? 5);
rmSync(FILE, { force: true });
execFileSync("npx", ["prisma", "db", "push", "--skip-generate"], {
  env: { ...process.env, DATABASE_URL: URL_ },
  stdio: "ignore",
});

process.env.DATABASE_URL = URL_;
process.env.PRISMA_SQLITE_ADAPTER = "libsql";
const { PrismaClient } = await import("@prisma/client");
const { PrismaLibSql } = await import("@prisma/adapter-libsql");
const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url: URL_ }) });

const hours = JSON.stringify(
  Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, { open: "00:00", close: "23:59" }])),
);
let failures = 0;
for (let round = 1; round <= rounds; round++) {
  const shop = await prisma.business.create({
    data: { name: `Race Air ${round}`, slug: `race-${round}-${Date.now()}`, environment: "test", timezone: "America/Chicago", hoursJson: hours, servicesJson: "[]" },
  });
  const leads = [];
  for (let i = 0; i < 6; i++) {
    leads.push(await prisma.lead.create({ data: { businessId: shop.id, phone: `+1555555${String(1000 + round * 10 + i)}`, status: "new", serviceType: "AC not cooling", address: `${i} Main St` } }));
  }
  const slot = new Date(Date.now() + (3 + round) * 86_400_000);
  slot.setUTCHours(17, 0, 0, 0);
  const startAt = Date.now() + 3000;
  const run = (ids) =>
    new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["--experimental-strip-types", "--import", "./scripts/lib/register-alias.mjs", "scripts/two-process-race.mjs", "worker", String(startAt), shop.id, slot.toISOString(), ...ids],
        { env: { ...process.env, DATABASE_URL: URL_, PRISMA_SQLITE_ADAPTER: "libsql", RACE_FILE: FILE }, stdio: ["ignore", "pipe", "inherit"] },
      );
      let out = "";
      child.stdout.on("data", (d) => (out += d));
      child.on("close", () => {
        const line = out.split("\n").find((l) => l.startsWith("RESULT "));
        line ? resolve(JSON.parse(line.slice(7))) : reject(new Error(`no result: ${out.slice(0, 200)}`));
      });
    });
  const [a, b] = await Promise.all([run(leads.slice(0, 3).map((l) => l.id)), run(leads.slice(3).map((l) => l.id))]);
  const all = [...a, ...b];
  const booked = all.filter((r) => r.booked);
  const jobs = await prisma.job.count({ where: { businessId: shop.id } });
  const others = all.filter((r) => r.error && r.error !== "slot_taken");
  const ok = booked.length <= 1 && jobs <= 1 && booked.length === jobs;
  if (!ok) failures += 1;
  console.log(`round ${round}: booked=${booked.length} jobsInDb=${jobs} slot_taken=${all.filter((r) => r.error === "slot_taken").length} lock_or_other_errors=${others.length} ${ok ? "OK" : "DOUBLE BOOKED"}`);
}
await prisma.$disconnect();
rmSync(FILE, { force: true });
console.log(failures ? `FAILED ${failures}/${rounds}` : `PASSED ${rounds}/${rounds}`);
process.exit(failures ? 1 : 0);
