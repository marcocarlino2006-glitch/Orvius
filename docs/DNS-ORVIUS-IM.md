# DNS setup for orvius.im

Your domain is registered at **Namecheap**.

## Current status (2026-09-04)

| Host | Status |
|------|--------|
| `orvius.im` | **Live on Vercel** (HTTP 200) |
| `api.orvius.im` | **Live** (`/api/health` 200) |

Manus (`cname.manus.space`) cutover is complete. Do not treat DNS as an open blocker.

## Architecture

| Host | Purpose |
|------|---------|
| `orvius.im` | Marketing + app |
| `app.orvius.im` | Optional app alias |
| `api.orvius.im` | Twilio + Vapi + Stripe webhooks |

## If DNS ever regresses

1. Namecheap → Advanced DNS — remove any Manus CNAME
2. Vercel → Domains — `orvius.im` + `api.orvius.im`
3. Verify: `curl -I https://orvius.im` and `curl https://api.orvius.im/api/health`

Stripe webhook URL: `https://api.orvius.im/api/billing/webhook`

See also `docs/FAILURE-LOG.md`, `docs/BILLING-SETUP.md`.
