# Billing setup

Orvius has **three paid plans** plus a free design partner program:

| Plan | Monthly | Annual | Best for |
|------|---------|--------|----------|
| **Line** | $149/mo | $124/mo billed yearly | Front door — AI receptionist, inbox, owner SMS |
| **Pro** | $299/mo | $249/mo billed yearly | Full workspace — customers, jobs, dispatch, Ask |
| **Fleet** | $499/mo | $429/mo billed yearly | 6+ trucks — priority support, multi-tech dispatch |

Plan copy and **need-based matching** live in `src/lib/pricing-plans.ts` and `src/lib/plan-needs.ts`.

| Plan | Price | Need it if… | Modules |
|------|-------|-------------|---------|
| **Line** | $149/mo | You miss after-hours calls | Today, Inbox, Calls |
| **Pro** | $299/mo | Leads don't become jobs | + Customers, Jobs, Dispatch, Ask |
| **Fleet** | $499/mo | 6+ trucks, dispatch chaos | Pro + priority support |

Pilot shops get **Pro access** during the 30-day program. Line subscribers see upgrade prompts for Pro modules.

## Check status

```bash
npm run billing:check
```

## Step 1 — Stripe secret key

```
STRIPE_SECRET_KEY=sk_test_...
```

## Step 2 — Create monthly + annual prices

```bash
npm run stripe:setup
```

Writes to `.env`:

```
STRIPE_PRICE_ID_LINE=price_...
STRIPE_PRICE_ID_PRO=price_...
STRIPE_PRICE_ID_FLEET=price_...
STRIPE_PRICE_ID_LINE_ANNUAL=price_...
STRIPE_PRICE_ID_PRO_ANNUAL=price_...
STRIPE_PRICE_ID_FLEET_ANNUAL=price_...
STRIPE_PRICE_ID=price_...        # legacy alias for Pro monthly
```

Add the same vars to Vercel.

## Step 3 — Webhook

URL: `https://api.orvius.im/api/billing/webhook`

Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

```
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Step 4 — Verify

```bash
npm run billing:check
```

Each plan's Subscribe button only appears when that plan's price ID is configured.

## Not done yet

- Plan upgrades/downgrades in-app (use Stripe Customer Portal for now)

## Pay prompt loop

Dashboard shell shows a recurring subscribe popup for any shop that is not `billingStatus: active`:

- **Pilot** — soft ask; snooze ~12h (tightens after day 21)
- **None / canceled** — stronger ask; snooze ~4–6h
- **Past due** — urgent; backdrop dismiss disabled; snooze 1h

When Stripe checkout is configured, the popup starts Checkout for Pro. Otherwise it routes to Billing / design partner.

## Customer portal

Active subscribers can open **Manage subscription** on Dashboard → Billing. Requires Customer Portal enabled in Stripe Dashboard → Settings → Billing → Customer portal.
