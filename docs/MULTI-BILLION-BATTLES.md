/**
 * Multi-billion path — seven battles.
 *
 * Best realistic outcome: become the vertical OS for HVAC / plumbing / electrical
 * (tens of billions ceiling). Not fantasy. This doc tracks what code can close vs
 * what only the founder can close.
 *
 * Operating rule: ship agent work same day; founder gates block the next battle.
 */

## Battles

| # | Battle | Agent ships | Founder must do |
|---|--------|-------------|-----------------|
| 1 | Wedge certification | Checklists, `wedge:ready`, failure log hygiene | 5 real-phone scenarios; owner cell ≠ shop line |
| 2 | Design partners + measured money | Baseline fields, outcomes vs baseline, pipeline CRM | Sign 10 pilots; log weekly recovered jobs |
| 3 | Production trust | Deploy/billing/ops gates, exclusive-line repair | DNS → Vercel; Stripe live; webhooks on api.orvius.im |
| 4 | Switching cost | Customer history + **data export** (trust lock-in) | Run shops daily until leaving hurts |
| 5 | Distribution | Admin prospect pipeline over waitlist | Daily outreach per OUTREACH-PLAYBOOK |
| 6 | Legal formation | Counsel TODO + localization notices | Set LLC formation state with counsel |
| 7 | Wedge-first story | Hero/about honesty (no premature AI OS) | Sell the front door until wedge is undefeated |

## Founder certification gate (Battle 1)

Before outreach volume or paid claims:

```bash
npm run wedge:ready          # 8/8 for Summit / design partner shop
npm run master:wedge         # setup + drills
# Then 5 real calls from YOUR cell — see docs/WEDGE-MASTERY.md
```

Log every miss in `docs/FAILURE-LOG.md`. Zero open blockers.

## Measured money gate (Battle 2)

For each design partner shop in Settings:

1. Set **avg ticket**
2. Set **baseline missed calls / week** and **baseline jobs / week** (before Orvius)
3. Command outcomes show after-hours captures + booking rate vs baseline
4. Weekly: owner confirms booked jobs that would have been missed

Proof artifact = screenshot + number, not a homepage claim.

## Production trust gate (Battle 3)

```bash
npm run deploy:check
npm run billing:check
npm run ops:check
npm run standard:check
npm run pre-post:check
```

DNS cutover: `docs/DNS-ORVIUS-IM.md`. Do not post until green.

## Distribution gate (Battle 5)

- Prospects land in waitlist → Admin **Prospect pipeline**
- Stages: `new → contacted → demoed → onboarded → live → closed`
- Demo: orvius.im/demo · Pilot: /pilot · Call audit CTA on homepage

## Legal gate (Battle 6)

`company.governingLawState` stays a placeholder until counsel confirms formation state.
Do not invent a state. Update `src/lib/company.ts` only after confirmation.

## Claim honesty gate (Battle 7)

Hero sells the wedge: missed calls → booked jobs.  
OS expansion lives below the fold (`HomeOsPath`).  
Never claim “never miss,” “100%,” or “guaranteed” — `npm run standard:check` enforces.

---

*Last updated: 2026-09-04*
