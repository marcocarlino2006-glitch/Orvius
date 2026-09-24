import assert from "node:assert/strict";
import test from "node:test";

process.env.AUTH_SECRET = "calendar-test-secret";
process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";

const { buildCalendar, calendarFeedToken, calendarFeedUrl, verifyCalendarFeedToken } = await import(
  "../src/lib/calendar-feed.ts"
);

test("calendar feed token round-trips and rejects tampering", () => {
  const token = calendarFeedToken("biz_123");
  assert.ok(token);
  assert.equal(verifyCalendarFeedToken(token), "biz_123");
  assert.equal(verifyCalendarFeedToken(`${token}.ics`), "biz_123");
  assert.equal(verifyCalendarFeedToken(token.replace("biz_123", "biz_999")), null);
  assert.equal(verifyCalendarFeedToken(`${token.slice(0, -1)}x`), null);
  assert.equal(verifyCalendarFeedToken("biz_123"), null);
  assert.match(calendarFeedUrl("biz_123"), /^https:\/\/app\.example\.com\/api\/public\/calendar\/biz_123\.[\w-]{32}\.ics$/);
});

test("calendar feed renders valid ICS with escaped, folded lines", () => {
  const ics = buildCalendar(
    "Summit Heating & Air",
    [
      {
        id: "job1",
        title: "No heat, furnace clicking",
        status: "scheduled",
        scheduledAt: new Date("2026-09-24T15:00:00Z"),
        durationMin: 90,
        address: "620 Grove St, Evanston IL",
        serviceType: "Heating repair",
        notes: "Gate code 4411; dog in yard. ".repeat(4),
        etaText: null,
        updatedAt: new Date("2026-09-24T12:00:00Z"),
        customerName: "Marcus Hill",
        customerPhone: "+13125550149",
        technicianName: "Ana Ruiz",
      },
      {
        id: "job2",
        title: "Cancelled tune-up",
        status: "cancelled",
        scheduledAt: new Date("2026-09-25T15:00:00Z"),
        durationMin: null,
        address: null,
        serviceType: null,
        notes: null,
        etaText: null,
        updatedAt: new Date("2026-09-24T12:00:00Z"),
        customerName: null,
        customerPhone: null,
        technicianName: null,
      },
    ],
    new Date("2026-09-24T12:00:00Z"),
  );
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.match(ics, /DTSTART:20260924T150000Z\r\nDTEND:20260924T163000Z/);
  assert.match(ics, /DTSTART:20260925T150000Z\r\nDTEND:20260925T170000Z/);
  assert.match(ics, /LOCATION:620 Grove St\\, Evanston IL/);
  assert.match(ics, /STATUS:TENTATIVE/);
  assert.match(ics, /STATUS:CANCELLED/);
  assert.match(ics, /SUMMARY:No heat\\, furnace clicking · Marcus Hill with Ana Ruiz/);
  for (const line of ics.split("\r\n")) {
    assert.ok(Buffer.byteLength(line) <= 75, `line too long: ${line}`);
  }
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 2);
});
