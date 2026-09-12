# Perfect standards chase

Rule: if it is below standard, it is listed. No vanity green.

Legend: `OPEN` · `IN_PROGRESS` · `CODE_DONE` · `FOUNDER_GATE` · `DONE`

## Blockers

| ID | Gap | Status |
|----|-----|--------|
| B1 | Live wedge 8/8 on real Twilio/Vapi | FOUNDER_GATE |
| B2 | Stripe live / first $ | FOUNDER_GATE |
| B3 | Resend live failover | FOUNDER_GATE |
| B4 | Alert cron cadence (night product) | CODE_DONE |
| B5 | Cron auth fail-closed | CODE_DONE |
| B6 | CSS landfill / eras | IN_PROGRESS |
| B7 | CI honesty (no skip-as-green) | CODE_DONE |
| B8 | Gap tracker honesty | CODE_DONE |

## High

| ID | Gap | Status |
|----|-----|--------|
| H9 | Command cockpit density | CODE_DONE |
| H10 | Nav ahead of wedge | CODE_DONE |
| H11 | Marketing oversells loop depth | CODE_DONE |
| H12 | Single-owner only | CODE_DONE |
| H13 | Money ring / Connect | CODE_DONE |
| H14 | Absolutist copy residue | CODE_DONE |
| H15 | README / AI receptionist story | CODE_DONE |
| H16 | Earned named proof | FOUNDER_GATE |
| H17 | Multi-shop without reality | CODE_DONE |
| H18 | Brand docs ≠ shipped | CODE_DONE |
| H19 | Auth allowlist fail-open in prod | CODE_DONE |
| H20 | CI build + trust required | CODE_DONE |
| H21 | Observability (Sentry) | CODE_DONE |
| H22 | Public rate limits | CODE_DONE |
| H23 | Formation unset | FOUNDER_GATE |
| H24 | One mailbox collapse | CODE_DONE |
| H25 | Support SLA vs staffing | CODE_DONE |
| H26 | Distribution / seeds | FOUNDER_GATE |
| H27 | Health endpoint hygiene | CODE_DONE |
| H28 | OS ring status honesty | CODE_DONE |

## Medium

| ID | Gap | Status |
|----|-----|--------|
| M29 | Settings density | CODE_DONE |
| M30 | Copilot vs Ask naming | CODE_DONE |
| M31 | Secondary pages thin | CODE_DONE |
| M32 | package 1.0.0 overclaim | CODE_DONE |

## Notes

- **Multi-b path:** Under `MULTI_B_CI=1` score stays **9/11** by design (wedge + institutional skipped, not vanity-green). CI exits **0** when only those intentional skips remain — skips stay printed red, never counted green. Closing the last two requires founder Twilio/Vapi on the install + Summit `wedge:ready` 8/8 against prod DB. Code side: Clarity gate fixed (`profile-menu` → `os-sidebar-footer`); reliability now honors env credentials so a stale local server cannot fake-fail a credentialed install.
- **B6:** globals.css ~13.9k after landfill cuts (was 26.9k). Target <8k open. Institution wave locks currently sit at file end — next cut is duplicate night-OS rules + superseded marketing eras, not more appends.


## Founder paste list (cannot code alone)

1. Re-verify live wedge 8/8 on cell (`wedge:ready` + Settings cert)  
2. Stripe keys + prices + webhook → first paid shop  
3. Confirm `RESEND_API_KEY` on Vercel  
4. Counsel formation → `formationStateConfirmed`  
5. One **external** named proof chapter (not Summit self-reference)  
6. Real outreach list (replace seeds)  
7. Optional: `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`  
8. Staff support or keep best-effort copy  

Run: `npm run multi-b:check`
