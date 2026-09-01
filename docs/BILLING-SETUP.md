# Billing setup

Orvius has **three paid plans** plus a free design partner program:

| Plan | Price | Best for |
|------|-------|----------|
| **Line** | $149/mo | Front door — AI receptionist, inbox, owner SMS |
| **Pro** | $299/mo | Full workspace — customers, jobs, dispatch, Ask |
| **Fleet** | $499/mo | 6+ trucks — priority support, multi-tech dispatch |

Plan copy lives in `src/lib/pricing-plans.ts`. Stripe must have matching products and price IDs before self-serve checkout works.

## Check status

```bash
npm run billing:check
```

## Step 1 — Stripe secret key

```
STRIPE_SECRET_KEY=sk_test_...
```

## Step 2 — Create all three prices

```bash
npm run stripe:setup
```

Writes to `.env`:

```
STRIPE_PRICE_ID_LINE=price_...
STRIPE_PRICE_ID_PRO=price_...
STRIPE_PRICE_ID_FLEET=price_...
STRIPE_PRICE_ID=price_...        # legacy alias for Pro
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

- Feature gating by plan tier (all plans get full product today — tier differentiation is pricing/copy until we gate)
- Stripe Customer Portal
- Plan upgrades/downgrades in-app
