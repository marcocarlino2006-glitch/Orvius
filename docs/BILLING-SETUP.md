# Billing setup

Orvius has **three paid plans** plus a free design partner program:

| Plan | Monthly | Annual | Best for |
|------|---------|--------|----------|
| **Line** | $199/mo | $166/mo billed yearly | Front door — AI receptionist, inbox, owner SMS |
| **Pro** | $399/mo | $333/mo billed yearly | Full workspace — customers, jobs, dispatch, Ask |
| **Fleet** | $749/mo | $624/mo billed yearly | 6+ trucks — unlimited technicians, multi-tech dispatch |

Plan copy and **need-based matching** live in `src/lib/pricing-plans.ts` and `src/lib/plan-needs.ts`.

| Plan | Price | Need it if… | Modules |
|------|-------|-------------|---------|
| **Line** | $199/mo | You miss after-hours calls | Today, Inbox, Calls |
| **Pro** | $399/mo | Leads don't become jobs | + Customers, Jobs, Dispatch, Ask |
| **Fleet** | $749/mo | 6+ trucks, dispatch chaos | Pro + unlimited technicians |

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

Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`

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

## Hard monetization (trial end)

- Every new shop gets `Business.pilotEndsAt` = create + **30 days**
- While entitled (`active`, `past_due` grace, or open pilot window): full product
- After pilot / canceled: APIs return **402** `billing_required`; UI shows `BillingLockScreen`
- Existing shops without `pilotEndsAt` fall back to `createdAt + 30 days`

## Pay prompt loop

Dashboard shell:

| Status | UI | Dismiss |
|--------|-----|---------|
| **active** | No prompt | — |
| **pilot** (mid-trial) | Soft modal | Snooze 2–4h |
| **pilot** ending ≤7d / **none** | Stronger soft modal | Snooze 2h |
| **past_due** | Full `BillingLockScreen` + portal CTA | Not dismissible |
| **expired pilot / canceled** | Full `BillingLockScreen` + Checkout | Not dismissible |

When Stripe checkout is configured, lock/modal starts Checkout for Pro (or Customer Portal for past_due). Otherwise routes to mailto / design partner — never a dead Checkout button.

## Customer portal

Active subscribers can open **Manage subscription** on Dashboard → Billing. Requires Customer Portal enabled in Stripe Dashboard → Settings → Billing → Customer portal.

## Email failover (Resend)

Required for magic-link sign-in and SMS→email alert backup:

```
RESEND_API_KEY=re_...
RESEND_FROM=Orvius <alerts@orvius.im>
```

Paste both on Vercel, redeploy, then Settings → Send test alert. Founders see the Resend gate panel on Settings when email is dark; owners never see env-var theater.
