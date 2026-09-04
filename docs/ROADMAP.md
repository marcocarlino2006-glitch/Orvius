/**
 * Orvius roadmap — multi-b status (2026-09-04).
 *
 * Ambition: dominate HVAC / plumbing / electrical as the vertical OS (tens of billions).
 * Standard: every surface is institutional. Cash, cert, and distribution are still red.
 *
 * Run: npm run multi-b:check
 */

## Multi-b scoreboard (honest)

| Gate | Product | Live reality |
|------|---------|--------------|
| Wedge (Summit) | ✅ 8/8 | Line live |
| Hard paywall | ✅ | Pilot ends; lock screen |
| Launch gates UI | ✅ | Settings cockpit + Today banners |
| Sales machine | ✅ code | Pipeline **empty** — 0 touches |
| Economics ritual | ✅ surfaces | Baseline + proof **unset** |
| Ops cron | ✅ vercel.json | Notifications every 5m |
| Stripe / ARR | ❌ | **$0** — founder keys |
| Phone cert | ❌ | Persistable, not completed |
| Formation | ❌ | Counsel |

**Dominate = close red gates in order. More features will not print ARR.**

---

## Ordered domination path

1. **Cert** — Settings → 5 cell scenarios (blocks honest outreach claims)
2. **Stripe** — Billing unblock → `npm run stripe:setup` → first Checkout  
   (success page confirms via `/api/billing/confirm` even if webhook lags)
3. **Baseline + weekly proof** — Summit measured money
4. **Import CSV + Daily run** — `/admin` import → `/admin/daily` → 20 touches
5. **10 paying or proving partners** — then expand OS rings
6. **Formation state** — counsel → `company.ts`

## Commands

```bash
npm run multi-b:check
npm run billing:check
npm run wedge:ready
```

Open every morning: **/admin/daily**

---

*Also: `docs/MULTI-BILLION-BATTLES.md`, `docs/FAILURE-LOG.md`*
