# Orvius operating standard

We hold ourselves to institutional bar **before** scale — not after. This is the chase.

## Principles

1. **The wedge is sacred** — Call → qualify → alert → inbox → action. Nothing ships that weakens this loop.
2. **Nothing fails silently** — Every alert attempt is logged. Owners see failures. We see queue depth.
3. **Owner language** — Dashboard copy is for a shop owner at 6am, not for us debugging webhooks.
4. **Honest product** — Every marketing claim must be true in production today.
5. **Word of mouth** — Build so well that one owner tells another. No blitz outbound to hide product gaps.
6. **Expand when pulled** — Jobs, dispatch, Ask deepen the record. They do not replace Ring 1 mastery.

## Scorecard

Run `npm run standard:check` before every deploy and public post.

| Standard | Bar | How we measure |
|----------|-----|----------------|
| **Reliability** | Would I bet my reputation on a 2am alert? | Queue empty, no stuck pending, delivery checks green |
| **Clarity** | Owner understands in 5 seconds? | No internal jargon in dashboard UI |
| **Isolation** | Shop A never sees Shop B? | All tenant APIs return 401 without session |
| **Speed** | Owner notified before they forget the call? | P95 alert latency under 60 seconds |
| **Recovery** | Owner knows when something breaks? | Failed/stuck alerts visible in Today + Settings |
| **Honesty** | Site claims match production? | Marketing audit passes in standard check |

## Ship gates

**Do not deploy or post if any blocker fails.**

- `npm run build`
- `npm run test:trust`
- `npm run standard:check`
- `npm run ci` (build + trust tests + live standard check — run before deploy)
- `npm run ci:quick` (build + trust tests + standard check without starting server)
- `npm run wedge:ready` (when validating a design partner shop)
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

When in doubt: **make the loop bulletproof for one shop, then the next.**
