/**
 * Shared text for shop forward one-pager (CLI + docs mirror).
 * Honest sales language — no warranties, no Connect claims.
 */

export function formatPhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return String(value ?? "").trim() || "(Orvius line not assigned yet)";
}

/**
 * @param {{
 *   shopName: string;
 *   orviusLine?: string | null;
 *   publicShopPhone?: string | null;
 *   ownerPhone?: string | null;
 *   ownerEmail?: string | null;
 * }} input
 */
export function buildForwardSheet(input) {
  const shop = input.shopName?.trim() || "Your shop";
  const line = formatPhone(input.orviusLine);
  const publicPhone = input.publicShopPhone?.trim()
    ? formatPhone(input.publicShopPhone)
    : "(your Google / truck / yard sign number)";
  const ownerPhone = input.ownerPhone?.trim()
    ? formatPhone(input.ownerPhone)
    : "(owner cell — not the shop line)";
  const ownerEmail =
    input.ownerEmail?.trim() || "(owner email for SMS failover)";

  return `
════════════════════════════════════════════════════════
ORVIUS — SHOP FORWARD ONE-PAGER
${shop}
════════════════════════════════════════════════════════

WHAT ORVIUS DOES
  • Answers the Orvius line (and any calls you forward to it)
  • Qualifies: name, phone, service, urgency, address
  • Proposes a job window and texts the customer a confirm link
  • Texts you the lead summary (email failover if SMS fails)
  • Keeps one shop record for leads, jobs, and weekly proof

WHAT ORVIUS DOES NOT DO (yet)
  • Catch calls on your public number unless you forward
  • Treat a proposed window as a locked appointment until the
    customer confirms the SMS link
  • Pay estimate card money into your shop bank (Connect later)
  • Sync Jobber / ServiceTitan
  • Guarantee “zero missed jobs” or 100% answer rate

────────────────────────────────────────────────────────
YOUR ORVIUS LINE:  ${line}
FORWARD FROM:      ${publicPhone}
OWNER ALERTS:      ${ownerPhone}
OWNER EMAIL:       ${ownerEmail}
────────────────────────────────────────────────────────

HOW TO FORWARD (carrier / phone system)
  1. Keep your public number on Google, trucks, and ads.
  2. Set missed / busy / no-answer / after-hours forward
     to the Orvius line above (CFNA / CFB / after-hours routing).
  3. Or publish the Orvius line as your main number.
  4. Place a live test call from your cell → confirm owner SMS.
  5. In Orvius Settings, check “Missed-call overflow” only after
     forward is real (or Orvius is your published line).

GO-LIVE CHECK (before promising capture)
  [ ] Orvius line answers a real call
  [ ] Owner cell gets the alert (not the Twilio line)
  [ ] Customer confirm SMS / link works after a book
  [ ] Overflow forward confirmed — or you told them honestly
  [ ] Avg ticket + before-Orvius baselines set
  [ ] Founder phone cert 5/5 stamped

SAY ON EVERY SALE
  “We catch what hits the Orvius line — forward missed and
   after-hours, or publish this number.”
  “Booked means proposed until the customer confirms.”
  “Card pay on estimates is Orvius checkout until Connect.”

Docs: docs/SHOP-FORWARD-ONEPAGER.md
Page: /pilot/forward
════════════════════════════════════════════════════════
`.trim();
}

export function buildSalesHonestyBullets() {
  return [
    "Forward required for public-number capture — or sell Orvius as the published line.",
    "Proposed window ≠ confirmed appointment until customer taps confirm.",
    "Estimate card ≠ shop bank until Stripe Connect.",
    "No Jobber/ServiceTitan sync claim.",
    "No zero-missed / 100% / guaranteed language.",
  ];
}
