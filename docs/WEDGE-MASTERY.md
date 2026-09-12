# Wedge mastery — shop-owner ready before money

Order: master the owner loop **before** public posting and charging.

## Checklist (must be green)

| # | Check | How it becomes true |
|---|--------|---------------------|
| 1 | Dedicated shop line | Twilio+Vapi provision via `ensureDedicatedShopLine`. Settings shows real error + Retry if blocked. |
| 2 | Line tested end-to-end | Completed Vapi call stamps `lineVerifiedAt` (EOC webhook). Onboarding verify also stamps when a completed call exists. |
| 3 | Owner mobile configured | Settings → owner phone ≠ shop line. Non-founders can save without cert payload. |
| 4 | Owner alert delivered | Settings → Send test alert. UI requires `ok: true`, not just HTTP 200. |
| 5 | First lead in inbox | Real call or SMS creates a Lead. |
| 6 | Lead auto-books to dispatch | Qualified lead (phone + service/address) → Job. SMS body becomes service text so qualify can pass. |
| 7 | Shop health clear | No critical line/assistant failure; stuck alerts cleared. |
| 8 | Founder phone cert 5/5 | Founder-only dogfood on Settings before promising after-hours. |

## Commands

```bash
npm run wedge:ready
MULTI_B_SKIP_CASH=1 npm run multi-b:check
```

## Partner rule

Design-partner / dogfood until 1–7 are green on a real line. Then post with earned proof. Then Stripe.
