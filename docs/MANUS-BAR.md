# Manus bar — bulletproof before you post

Manus became multi-b because the public product was **already airtight** when they shipped.
Orvius does the same: **no soft launch theater**.

## The rule

```bash
npm run bulletproof
```

Exit 0 = allowed to post the wedge.
Exit 1 = **do not post**. Fix reds.

Product-only dry run (no Stripe/legal):

```bash
BULLETPROOF_SKIP_CASH=1 npm run bulletproof
```

Still do **not** claim self-serve paid checkout until cash gates are green.

## What “bulletproof” means here

| Layer | Must be true |
|-------|----------------|
| Wedge | Dedicated line answers → lead → owner SMS → book |
| Honesty | Proposed window ≠ confirmed until customer taps |
| Overflow | Forward truth in Settings + `/pilot/forward` |
| Attention | Owner can Text confirm + advance at-risk jobs |
| Demo | `/demo` does not fake locked appointments |
| Isolation | Tenant APIs 401 without auth |
| Claims | No never-miss / guaranteed / every-call in post copy |
| Cash (full bar) | Stripe keys + prices + webhook live |
| Legal (full bar) | Formation state counsel-confirmed — never invent |

## What you still must do (founder)

1. Paste Stripe secrets → `npm run stripe:setup` → webhook
2. Reply with LLC formation state for counsel (one word)
3. Re-run live phone cert from **your** cell
4. Record 60–90s proof: call → SMS → dashboard → confirm
5. Only then post — wedge claim only

## Allowed first post

> Orvius answers after-hours and overflow on a dedicated shop line — qualifies the job, proposes a window, and texts the owner before the competitor picks up.
>
> Forward your missed / busy / after-hours calls (or publish the Orvius number). First ten shops · thirty days free · orvius.im/pilot

## Forbidden in the first post

- “Answers every call” / “never miss” / “guaranteed”
- Jobber / ServiceTitan sync
- Card pay lands in the shop bank (Connect not live)
- Fake case studies or invented ARR

See also: `docs/PRE-POST-GATE.md`, `docs/MULTI-BILLION-BATTLES.md`, `npm run multi-b:check`.
