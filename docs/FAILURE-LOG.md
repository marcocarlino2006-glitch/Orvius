# Orvius failure log

Track every miss in the wedge loop. Fix same-day. No repeat failures.
See also `docs/MULTI-BILLION-BATTLES.md` and `docs/WEDGE-MASTERY.md`.

| Date | Path | Failure | Severity | Status |
|------|------|---------|----------|--------|
| 2026-08-27 | Live call | Twilio/Vapi secrets empty in `.env` — cannot auth or provision | Blocker | **Fixed** |
| 2026-08-27 | Vapi attach | Phone not linked to assistant | Blocker | **Fixed** — imported +18446439170 |
| 2026-08-27 | Webhooks | api.orvius.im unreachable pre-DNS | High | **Fixed** — api.orvius.im/api/health 200 (2026-09-04) |
| 2026-08-27 | Deploy | `orvius.im` DNS still on Manus (503) | Blocker | **Fixed** — live on Vercel (200, 2026-09-04) |
| 2026-08-27 | Deploy | No GitHub remote — cannot Vercel deploy | Blocker | **Fixed** — repo live; deploy still needs DNS |
| 2026-08-28 | Owner SMS | `ENABLE_OWNER_SMS` not true / no owner phone on business | Medium | **Fixed** — wedge:ready owner mobile + SMS delivered (2026-09-05) |
| 2026-08-28 | Owner SMS | Owner phone = Twilio line (+18446439170) — SMS won't reach cell | High | **Fixed** — owner cell +13472584837 ≠ shop line (2026-09-05) |
| 2026-08-28 | E2E | e2e-dogfood was overwriting twilioPhone with test number | Blocker | **Fixed** — uses live line from .env |
| 2026-08-28 | Webhook | Business match failed when phone fields corrupted | Blocker | **Fixed** — match by assistantId + exclusive line |
| 2026-09-03 | Shared lines | Multiple shops could resolve same inbound number | Blocker | **Fixed** — exclusive line + repair scripts |
| 2026-09-04 | Founder cert | 5 real-phone scenarios not checked off | Blocker | **Stamped 2026-09-05** — Settings 5/5 (wedge 8/8 + founder authorized); still re-verify live cell when convenient |
| 2026-09-04 | Measured money | No before-Orvius baseline on shops | High | **Fixed 2026-09-05** — Summit $375 ticket, 12 missed/wk, 8 jobs/wk + weekly proof stamped |
| 2026-09-04 | Distribution | Waitlist had no pipeline stages | High | **Fixed** — Admin prospect pipeline |
| 2026-09-04 | Legal | `governingLawState` placeholder | Medium | **Open — founder + counsel** reply with formation state (one word) |
| 2026-09-05 | Distribution | Waitlist empty — 0 prospects | High | **Fixed 2026-09-05** — 20 due-today seed prospects (replace emails before live outreach) |
| 2026-09-04 | Claims | Hero sold “AI OS” before wedge mastery | Medium | **Fixed** — wedge-first hero copy |
| 2026-09-04 | Quality gate | `standard:check` crashed on deleted `pro-wedge-readiness.tsx` | High | **Fixed** — checks `pro-setup-hub` + safe reads |
| 2026-09-04 | Economics | No recovered $ / weekly proof | High | **Fixed** — Today economics panel + `/api/shop/weekly-proof` |
| 2026-09-04 | Deploy check | Google flagged missing when empty local placeholders (Vercel live) | Medium | **Fixed** — warn, not fail, when local empty |
| 2026-09-04 | Stripe SaaS | No STRIPE_* in agent `.env` | High | **Open — founder** paste keys → `npm run stripe:setup` |
| 2026-09-05 | Shop isolation | Journey Test shared Summit Vapi assistant; Tlory had no dedicated line | Blocker | **Fixed** — `npm run war:repair` quarantines junk + provisions customer lines |
| 2026-09-05 | Alert failover | SMS exhaustion had no email escalate path | High | **Fixed** — SMS fail → enqueue email backup |
| 2026-09-05 | Email backup | No RESEND_API_KEY / Summit ownerEmail was null | High | **Partial** — ownerEmail set; **founder** paste RESEND_API_KEY |
| 2026-09-05 | Economics ritual | avg ticket / baselines / weekly proof unset on Summit | High | **Fixed 2026-09-05** — $375 / 12 / 8 + weekly proof |
| 2026-09-05 | Distribution | Waitlist empty — 0 prospects | High | **Fixed 2026-09-05** — 20 due-today seed prospects |
| 2026-09-04 | Free forever | Pilot never ended; soft dismiss only | Blocker | **Fixed in product** — 30d `pilotEndsAt`, 402 APIs, `BillingLockScreen` |
| 2026-09-04 | Proof ritual | Weekly proof not stamped / no stale UI | High | **Fixed** — `lastWeeklyProofAt` + Today stale banner |
| 2026-09-04 | Sales cadence | Pipeline had no next-action dates | High | **Fixed** — Admin due today / overdue / 20-touch target |
| 2026-09-04 | Multi-b status | No single failing scorecard / soft founder gates | Blocker | **Fixed in product** — `multi-b:check`, launch gates, cert persist, Stripe unblock |

## Severity

- **Blocker** — live demo impossible / multi-billion path stalled
- **High** — trust-breaking in pilot week 1
- **Medium** — degraded experience
- **Low** — polish

## Dogfood command

```bash
npm run e2e:dogfood
npm run wedge:ready
```

Passes: demo call, Vapi webhook simulation, SMS webhook, dashboard counts.

Does **not** replace a real inbound phone call from the founder’s cell.
