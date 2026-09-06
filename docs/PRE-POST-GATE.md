# Pre-post gate

Do **not** post orvius.im publicly until the Manus bar is green.

## Automated check

```bash
npm run bulletproof
```

Product-only dry run (no Stripe / formation yet):

```bash
BULLETPROOF_SKIP_CASH=1 npm run bulletproof
```

Also useful:

```bash
npm run multi-b:check
npm run pre-post:check
```

## Manus bar (non-negotiable)

Post only when **every public claim has a working path**.

| Must be true | Why |
|--------------|-----|
| `npm run wedge:ready` green | Live shop line actually works |
| Confirm loop live | Booked ≠ confirmed until customer taps |
| Overflow truth in Settings | No fake “we catch your public number” |
| Attention actions work | Owner can text confirm / advance at-risk |
| `/demo` honesty | Demo matches product |
| No overclaim post copy | Never-miss / every-call / guaranteed banned |
| Stripe live (full bar) | Or do not sell self-serve checkout |
| Formation counsel-confirmed (full bar) | Or do not invent LLC state |

Full write-up: `docs/MANUS-BAR.md`

## Manual gate (founder)

### Blockers

- [ ] Call live shop line from your phone → lead in `/dashboard`
- [ ] Owner SMS within ~30s
- [ ] Customer confirm SMS + `/c/...` works after a book
- [ ] Overflow forward real (or Orvius number is published)
- [ ] `npm run bulletproof` exit 0 (or product-only + no cash claims)
- [ ] 60–90s screen recording: call → alert → dashboard → confirm

### Quality

- [ ] Homepage + `/demo` match live behavior
- [ ] Settings go-live checklist understood
- [ ] You would put your own shop on Orvius tomorrow

## Sequence

1. `BULLETPROOF_SKIP_CASH=1 npm run bulletproof` — fix product reds
2. Paste Stripe → `npm run stripe:setup` → webhook
3. Counsel: formation state → set `formationStateConfirmed`
4. `npm run bulletproof` full — must be green
5. Record proof demo
6. First post — wedge only

## Allowed first post

> Orvius answers after-hours and overflow on a dedicated shop line — qualifies the job, proposes a window, and texts the owner before the competitor picks up.
>
> Forward your missed / busy / after-hours calls (or publish the Orvius number). First ten shops · thirty days free · orvius.im/pilot

## Forbidden in the first post

- “Answers every call” / “never miss” / “guaranteed”
- Jobber / ServiceTitan sync
- Card pay lands in the shop bank
- Fake case studies or invented ARR

---

*Updated for Manus bar — 2026-09-06*
