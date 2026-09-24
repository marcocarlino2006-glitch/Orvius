import { createHmac, timingSafeEqual } from "node:crypto";
import { DEFAULT_JOB_DURATION_MIN } from "@/lib/availability";
import { displayPhone } from "@/lib/customer";
import { getAppUrl } from "@/lib/env";
import { jobStatusLabel } from "@/lib/job-status";
import { prisma } from "@/lib/prisma";

/*
  The feed URL is the credential: calendar apps poll it with no session. It is
  signed rather than stored so it needs no schema change, which means it cannot
  be revoked per shop without rotating AUTH_SECRET.
*/
const FEED_VERSION = "v1";
const PAST_DAYS = 30;
const FUTURE_DAYS = 180;

function feedSecret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || null;
}

function sign(businessId: string, secret: string) {
  return createHmac("sha256", secret).update(`calendar:${FEED_VERSION}:${businessId}`).digest("base64url").slice(0, 32);
}

export function calendarFeedToken(businessId: string) {
  const secret = feedSecret();
  return secret ? `${businessId}.${sign(businessId, secret)}` : null;
}

export function calendarFeedUrl(businessId: string) {
  const token = calendarFeedToken(businessId);
  return token ? `${getAppUrl().replace(/\/$/, "")}/api/public/calendar/${token}.ics` : null;
}

export function verifyCalendarFeedToken(raw: string): string | null {
  const secret = feedSecret();
  const token = raw.replace(/\.ics$/, "");
  const dot = token.lastIndexOf(".");
  if (!secret || dot <= 0) return null;
  const businessId = token.slice(0, dot);
  const presented = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(businessId, secret));
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) return null;
  return businessId;
}

function icsDate(at: Date) {
  return at.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function icsText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/* RFC 5545 caps content lines at 75 octets; continuation lines start with a space. */
function fold(line: string) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = 74;
  }
  return parts.join("\r\n ");
}

export type CalendarJob = {
  id: string;
  title: string;
  status: string;
  scheduledAt: Date;
  durationMin: number | null;
  address: string | null;
  serviceType: string | null;
  notes: string | null;
  etaText: string | null;
  updatedAt: Date;
  customerName: string | null;
  customerPhone: string | null;
  technicianName: string | null;
};

export function buildCalendar(shopName: string, jobs: CalendarJob[], now = new Date()) {
  const appUrl = getAppUrl().replace(/\/$/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Orvius//Jobs//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(`${shopName} jobs`)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
  ];

  for (const job of jobs) {
    const start = job.scheduledAt;
    const end = new Date(start.getTime() + (job.durationMin ?? DEFAULT_JOB_DURATION_MIN) * 60_000);
    const who = [job.customerName, job.technicianName ? `with ${job.technicianName}` : null].filter(Boolean).join(" ");
    const description = [
      `Status: ${jobStatusLabel(job.status)}`,
      job.serviceType ? `Service: ${job.serviceType}` : null,
      job.customerName ? `Customer: ${job.customerName}` : null,
      job.customerPhone ? `Phone: ${displayPhone(job.customerPhone)}` : null,
      job.technicianName ? `Tech: ${job.technicianName}` : "Tech: unassigned",
      job.etaText ? `ETA: ${job.etaText}` : null,
      job.notes ? `Notes: ${job.notes}` : null,
      `${appUrl}/dashboard/jobs/${job.id}`,
    ].filter(Boolean);

    lines.push(
      "BEGIN:VEVENT",
      `UID:job-${job.id}@orvius`,
      `DTSTAMP:${icsDate(now)}`,
      `LAST-MODIFIED:${icsDate(job.updatedAt)}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsText(who ? `${job.title} · ${who}` : job.title)}`,
      `DESCRIPTION:${icsText(description.join("\n"))}`,
      `URL:${appUrl}/dashboard/jobs/${job.id}`,
      `STATUS:${job.status === "cancelled" ? "CANCELLED" : job.status === "scheduled" ? "TENTATIVE" : "CONFIRMED"}`,
    );
    if (job.address) lines.push(`LOCATION:${icsText(job.address)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export async function loadCalendarFeed(businessId: string, now = new Date()) {
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } });
  if (!business) return null;
  const jobs = await prisma.job.findMany({
    where: {
      businessId,
      scheduledAt: {
        gte: new Date(now.getTime() - PAST_DAYS * 86_400_000),
        lte: new Date(now.getTime() + FUTURE_DAYS * 86_400_000),
      },
    },
    orderBy: { scheduledAt: "asc" },
    take: 2000,
    select: {
      id: true,
      title: true,
      status: true,
      scheduledAt: true,
      durationMin: true,
      address: true,
      serviceType: true,
      notes: true,
      etaText: true,
      updatedAt: true,
      customer: { select: { name: true, phone: true } },
      lead: { select: { name: true, phone: true } },
      technician: { select: { name: true } },
    },
  });
  return buildCalendar(
    business.name,
    jobs.map((job) => ({
      id: job.id,
      title: job.title,
      status: job.status,
      scheduledAt: job.scheduledAt!,
      durationMin: job.durationMin,
      address: job.address,
      serviceType: job.serviceType,
      notes: job.notes,
      etaText: job.etaText,
      updatedAt: job.updatedAt,
      customerName: job.customer?.name ?? job.lead?.name ?? null,
      customerPhone: job.customer?.phone ?? job.lead?.phone ?? null,
      technicianName: job.technician?.name ?? null,
    })),
    now,
  );
}
