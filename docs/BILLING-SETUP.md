# Billing setup

Orvius Pro is **$299/month** flat. Pricing copy lives in `src/lib/company.ts`. Stripe must have a matching product and price before self-serve checkout works.

## Current state (honest)

If you have not run setup, these are missing:

- `STRIPE_SECRET_KEY` — Stripe API secret
- `STRIPE_PRICE_ID` — recurring $299/mo price id (created by setup script)
- `STRIPE_WEBHOOK_SECRET` — so subscriptions sync to your database after payment

Until all three are set, the site shows **Apply for design partner** instead of Subscribe. That is intentional.

## Check status

```bash
npm run billing:check
```

This validates env vars and confirms the Stripe price matches $299/mo.

## Step 1 — Stripe account + secret key

1. Create account: https://dashboard.stripe.com/register
2. Developers → API keys
3. Copy **Secret key** → add to `.env` and Vercel:

```
STRIPE_SECRET_KEY=sk_test_...
```

Use test keys until you are ready for live charges.

## Step 2 — Create product + price

With `STRIPE_SECRET_KEY` in `.env`:

```bash
npm run stripe:setup
```

This creates **Orvius Pro** at **$299/mo** in Stripe (or reuses existing) and writes `STRIPE_PRICE_ID` to `.env`.

Add the same vars to Vercel.

## Step 3 — Webhook (required for subscription sync)

After deploy, in Stripe Dashboard → Developers → Webhooks → Add endpoint:

| Field | Value |
|-------|-------|
| URL | `https://api.orvius.im/api/billing/webhook` |
| Events | `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` |

Copy the signing secret:

```
STRIPE_WEBHOOK_SECRET=whsec_...
```

Without this, checkout may work but `billingStatus` on the shop will not update.

## Step 4 — Verify

```bash
npm run billing:check   # all green
npm run deploy:check    # includes billing warning if still missing
```

Then test: sign in → Dashboard → Billing → Subscribe → complete test checkout in Stripe test mode.

## What is not done yet

- Live Stripe account / bank payout setup (your Stripe Dashboard)
- Production webhook on api.orvius.im (needs deploy + DNS)
- Customer portal for cancel/update card (future)
- Pilot → paid conversion automation (manual checkout link for now)

Do not market self-serve Subscribe until `npm run billing:check` passes in production.
