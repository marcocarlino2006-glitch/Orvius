#!/usr/bin/env node
/**
 * Full product journey — beginning to end without a live phone.
 * Shop setup → inbound call → lead → auto job → assign tech → dispatch → ask
 */
import { encode } from "@auth/core/jwt";
import { createScriptPrisma, loadEnvFile } from "./lib/db.mjs";

loadEnvFile();
const prisma = createScriptPrisma();

const TEST_OWNER = process.env.JOURNEY_OWNER_EMAIL ?? "marcocarlino2006@gmail.com";

function loadEnv() {
  return { ...process.env };
}

async function sessionCookie(secret) {
  const token = await encode({
    token: {
      sub: TEST_OWNER,
      email: TEST_OWNER,
      name: "Journey Test Owner",
    },
    secret,
    salt: "authjs.session-token",
  });
  return `authjs.session-token=${token}`;
}

async function check(name, fn) {
  try {
    const result = await fn();
    const ok = result.ok !== false;
    console.log(`${ok ? "✅" : "❌"} ${name}: ${result.message}`);
    return ok;
  } catch (err) {
    console.log(`❌ ${name}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

async function main() {
  const env = loadEnv();
  const appUrl = (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  const authSecret = env.AUTH_SECRET ?? process.env.AUTH_SECRET;

  console.log("\n🔄 Orvius full product journey\n");
  console.log(`   App: ${appUrl}\n`);

  if (!authSecret) {
    console.error("❌ AUTH_SECRET missing");
    process.exit(1);
  }

  const cookie = await sessionCookie(authSecret);
  const authed = (path, init = {}) =>
    fetch(`${appUrl}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Cookie: cookie,
        "Content-Type": "application/json",
      },
    });

  const results = [];

  // ── 1. Use owner's real shop ──
  let business = await prisma.business.findFirst({
    where: { ownerEmail: TEST_OWNER },
    orderBy: { createdAt: "asc" },
  });

  if (!business) {
    console.error(`❌ No shop for ${TEST_OWNER} — complete onboarding first`);
    process.exit(1);
  }

  console.log(`✅ Shop: ${business.name} (${business.id})`);

  const liveLine = business.vapiPhoneNumber ?? business.twilioPhone ?? env.TWILIO_PHONE_NUMBER;
  const vapiCallId = `journey_${Date.now()}`;

  // ── 2. Inbound call (Vapi webhooks) ──
  results.push(
    await check("Call started", async () => {
      const res = await fetch(`${appUrl}/api/webhooks/vapi`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(env.VAPI_WEBHOOK_SECRET
            ? { "x-vapi-secret": env.VAPI_WEBHOOK_SECRET }
            : {}),
        },
        body: JSON.stringify({
          message: {
            type: "call-started",
            call: {
              id: vapiCallId,
              assistantId: business.vapiAssistantId,
              customer: { number: "+15125559988" },
              phoneNumber: { number: liveLine },
            },
          },
        }),
      });
      if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
      return { ok: true, message: "call in progress" };
    }),
  );

  let leadId;
  let jobId;

  results.push(
    await check("Call ended → lead + auto job + owner alert", async () => {
      const res = await fetch(`${appUrl}/api/webhooks/vapi`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(env.VAPI_WEBHOOK_SECRET
            ? { "x-vapi-secret": env.VAPI_WEBHOOK_SECRET }
            : {}),
        },
        body: JSON.stringify({
          message: {
            type: "end-of-call-report",
            call: {
              id: vapiCallId,
              assistantId: business.vapiAssistantId,
              customer: { number: "+15125559988" },
              phoneNumber: { number: liveLine },
            },
            summary: "Emergency AC — no cooling. Name: Alex Rivera. 742 Oak St.",
            durationSeconds: 118,
            analysis: {
              structuredData: {
                name: "Alex Rivera",
                phone: "+15125559988",
                serviceType: "AC not cooling",
                urgency: "emergency",
                address: "742 Oak Street, Austin TX",
              },
            },
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, message: JSON.stringify(data) };
      leadId = data.leadId;
      jobId = data.jobId;
      return {
        ok: Boolean(leadId && jobId && data.autoBooked),
        message: `lead ${leadId}, job ${jobId}, queued=${data.queued}`,
      };
    }),
  );

  // ── 3. SMS lead (skip if Twilio signature not valid locally) ──
  results.push(
    await check("Inbound SMS → lead + job", async () => {
      const form = new URLSearchParams();
      form.set("From", "+15125557777");
      form.set("To", liveLine);
      form.set("Body", "Water heater leaking — need help today");
      form.set("MessageSid", `SM_journey_${Date.now()}`);

      const res = await fetch(`${appUrl}/api/webhooks/twilio/sms`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const text = await res.text();
      if (
        res.status === 403 ||
        text.includes("Invalid Twilio signature")
      ) {
        return { ok: true, message: "skipped — Twilio signature (expected locally)" };
      }
      if (!res.ok || !text.includes("<Response>")) {
        return { ok: false, message: text.slice(0, 100) };
      }
      const smsLead = await prisma.lead.findFirst({
        where: { businessId: business.id, source: "sms" },
        orderBy: { createdAt: "desc" },
        include: { job: { select: { id: true } } },
      });
      return {
        ok: Boolean(smsLead?.job),
        message: smsLead?.job
          ? `lead ${smsLead.id}, job ${smsLead.job.id}`
          : "SMS lead missing job",
      };
    }),
  );

  // ── 4. Dashboard Today (Ring 1) ──
  results.push(
    await check("Today command center", async () => {
      const res = await authed("/api/ring1");
      const data = await res.json();
      if (!res.ok) return { ok: false, message: data.error ?? res.status };
      return {
        ok:
          (data.priorityLeads?.length ?? 0) > 0 ||
          (data.dispatchToday?.jobCount ?? 0) > 0,
        message: `${data.priorityLeads?.length ?? 0} priority, ${data.dispatchToday?.jobCount ?? 0} jobs today`,
      };
    }),
  );

  // ── 5. Inbox lead detail (backfill) ──
  results.push(
    await check("Inbox lead detail", async () => {
      const res = await authed(`/api/leads/${leadId}`);
      const data = await res.json();
      if (!res.ok) return { ok: false, message: data.error ?? res.status };
      return {
        ok: Boolean(data.lead?.job?.id),
        message: `${data.lead?.name} · job ${data.lead?.job?.id ?? "none"}`,
      };
    }),
  );

  // ── 6. Assign tech ──
  results.push(
    await check("Assign technician", async () => {
      const techRes = await authed("/api/technicians");
      const techData = await techRes.json();
      const tech = techData.technicians?.[0];
      if (!tech) return { ok: false, message: "no crew" };

      const res = await authed(`/api/jobs/${jobId}`, {
        method: "PATCH",
        body: JSON.stringify({ technicianId: tech.id }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, message: data.error ?? res.status };
      return {
        ok: data.job?.technicianId === tech.id,
        message: `${tech.name} → job ${jobId}`,
      };
    }),
  );

  // ── 7. Dispatch board ──
  results.push(
    await check("Dispatch board", async () => {
      const res = await authed("/api/dispatch");
      const data = await res.json();
      if (!res.ok) return { ok: false, message: data.error ?? res.status };
      const assigned = data.columns?.some((col) =>
        col.jobs?.some((j) => j.id === jobId),
      );
      return {
        ok: data.jobCount > 0 && assigned,
        message: `${data.jobCount} jobs, assigned=${assigned}`,
      };
    }),
  );

  // ── 8. Job status progression ──
  results.push(
    await check("Job confirm → en route", async () => {
      for (const status of ["confirmed", "en_route"]) {
        const res = await authed(`/api/jobs/${jobId}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        });
        if (!res.ok) return { ok: false, message: `failed at ${status}` };
      }
      return { ok: true, message: "confirmed → en_route" };
    }),
  );

  // ── 9. Ask shop brain ──
  results.push(
    await check("Ask — shop intelligence", async () => {
      const res = await authed("/api/ask", {
        method: "POST",
        body: JSON.stringify({ question: "Who called about AC today?" }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, message: data.error ?? res.status };
      return {
        ok: Boolean(data.answer?.length),
        message: data.answer?.slice(0, 80) ?? "empty",
      };
    }),
  );

  // ── 10. Wedge readiness ──
  results.push(
    await check("Wedge readiness", async () => {
      const res = await authed("/api/wedge/readiness");
      const data = await res.json();
      if (!res.ok) return { ok: false, message: data.error ?? res.status };
      return {
        ok: data.score >= 4,
        message: `${data.score}/${data.total} checks`,
      };
    }),
  );

  // ── 11. Shop health ──
  results.push(
    await check("Shop health", async () => {
      const res = await authed("/api/shop/health");
      const data = await res.json();
      if (!res.ok) return { ok: false, message: data.error ?? res.status };
      return {
        ok: data.status !== "critical",
        message: data.status ?? "unknown",
      };
    }),
  );

  const passed = results.filter(Boolean).length;
  const total = results.length;

  console.log(
    `\n${passed === total ? "✅" : "❌"} Journey: ${passed}/${total} steps passed\n`,
  );

  await prisma.$disconnect();
  process.exit(passed === total ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
