# Orvius failure log

Track every miss in the wedge loop. Fix same-day. No repeat failures.

| Date | Path | Failure | Severity | Status |
|------|------|---------|----------|--------|
| 2026-08-27 | Live call | Twilio/Vapi secrets empty in `.env` — cannot auth or provision | Blocker | Open |
| 2026-08-27 | Deploy | `orvius.im` DNS still on Manus (503) | Blocker | Open |
| 2026-08-27 | Deploy | No GitHub remote — cannot Vercel deploy | Blocker | Open |
| 2026-08-27 | Owner SMS | `ENABLE_OWNER_SMS` not true / no owner phone on business | Medium | Open |

## Severity

- **Blocker** — live demo impossible
- **High** — trust-breaking in pilot week 1
- **Medium** — degraded experience
- **Low** — polish

## Dogfood command

```bash
npm run e2e:dogfood
```

Passes: demo call, Vapi webhook simulation, SMS webhook, dashboard counts.

Does **not** replace a real inbound phone call.
