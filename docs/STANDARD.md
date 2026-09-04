# Orvius operating standard

We are building toward institutional quality — not claiming we are there yet. This doc tracks what we actually hold ourselves to today.

## Principles

1. **The wedge is sacred** — Call → qualify → alert → inbox → action. Nothing ships that weakens this loop.
2. **Nothing fails silently** — Every alert attempt is logged. Owners see failures. We see queue depth.
3. **Owner language** — Dashboard copy is for a shop owner at 6am, not for us debugging webhooks.
4. **Honest product** — Every marketing claim must be true in production today. No Subscribe button until Stripe is configured.
5. **Word of mouth** — Build so well that one owner tells another. No blitz outbound to hide product gaps.
6. **Expand when pulled** — Jobs, dispatch, Ask deepen the record. They do not replace front-door mastery.

## Prerequisites (not optional for paid launch)

| Area | Status check | Blocker if missing |
|------|--------------|-------------------|
| **Billing** | `npm run billing:check` | No self-serve checkout; pilot only |
| **Trust wedge** | `npm run wedge:ready` | Shop not production-ready |
| **Deploy** | `npm run deploy:check` | Twilio, Vapi, auth, database |
| **Turso schema** | `npm run db:push` on prod DB | New columns/tables missing |

See `docs/BILLING-SETUP.md` for Stripe product, price id, and webhook setup.
See `docs/INSTITUTIONAL-PLAYBOOK.md` for practices adapted from operators at scale.

## Scorecard

Run `npm run standard:check` before every deploy and public post.

| Standard | Bar | How we measure |
|----------|-----|----------------|
| **Reliability** | Would I bet my reputation on a 2am alert? | Queue empty, no stuck pending, delivery checks green |
| **Clarity** | Owner understands in 5 seconds? | No internal jargon in dashboard UI |
| **Isolation** | Shop A never sees Shop B? | All tenant APIs return 401 without session |
| **Speed** | Owner notified before they forget the call? | P95 alert latency under 60 seconds |
| **Recovery** | Owner knows when something breaks? | Failed/stuck alerts visible in Today + Settings |
| **Honesty** | Site claims match production? | No fake Subscribe; billing check passes before paid marketing |

## Ship gates

**Do not deploy paid checkout or post pricing CTAs if billing blockers fail.**

- `npm run build`
- `npm run test:trust`
- `npm run ops:check` (institutional ops — trust, billing, standard, playbook)
- `npm run billing:check` (before enabling Subscribe)
- `npm run standard:check`
- `npm run ci` (build + trust tests + live standard check — run before deploy)
- `npm run ci:quick` (build + trust tests + standard check without starting server)
- `npm run wedge:ready` (when validating a design partner shop)
- `npm run economics:check` (shop money surfaces — recovered $, proof export)
- `npm run pre-post:check` (before public marketing)

## Wedge definition of done

For each design partner shop:

- [ ] Dedicated line provisioned and verified with a completed test call
- [ ] Owner mobile ≠ shop line
- [ ] Test alert delivered (SMS and/or email)
- [ ] First real lead appeared in inbox with owner notification
- [ ] Shop health green or attention-only (no critical)

## What we do not optimize for yet

- Feature breadth before wedge proof
- Vanity metrics on the homepage
- Cold outbound volume
- Per-minute billing complexity
- Claiming "institutional" or "multi-billion" bar before billing, retention, and ops proof exist

When in doubt: **make the loop bulletproof for one shop, then the next.**
