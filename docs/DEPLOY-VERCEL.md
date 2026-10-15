# Deploy Orvius to Vercel

## 1. Push to GitHub

```bash
# On github.com → New repository → orvius (empty, no README)

git remote add origin https://github.com/YOUR_USERNAME/orvius.git
git branch -M main
git push -u origin main
```

## 2. Import on Vercel

1. [vercel.com/new](https://vercel.com/new) → Import GitHub repo
2. Framework: **Next.js** (auto)
3. Build command (from `vercel.json`): `npm run db:generate && npm run build`

## 3. Environment variables

Copy everything from your `.env` into Vercel → Settings → Environment Variables:

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | Use **Turso** or **Neon Postgres** for production — SQLite won't persist on Vercel serverless |
| `NEXT_PUBLIC_APP_URL` | `https://api.orvius.im` |
| `TWILIO_*` | Your Twilio credentials |
| `VAPI_*` | Your Vapi credentials |
| `ORVIUS_*` | Domain config |
| `ENABLE_OWNER_SMS` | `true` when owner phones are set |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_PRICE_ID` | From `npm run stripe:setup` ($399/mo Orvius Pro) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `RESEND_API_KEY` | Resend API key — magic links + SMS→email failover |
| `RESEND_FROM` | Verified sender, e.g. `Orvius <alerts@orvius.im>` |
| `ORVIUS_FOUNDER_EMAILS` | Comma-separated emails that unlock founder instruments (Stripe/Resend gate panels, cert, Manus next). Fail closed if unset. |

**Stripe webhook (after deploy):** `https://api.orvius.im/api/billing/webhook`  
Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

**Founder money + failover order:** Set `ORVIUS_FOUNDER_EMAILS` to your login email → Stripe keys → `npm run stripe:setup` → webhook → first Checkout $ → Resend paste → redeploy. Product surfaces the same order on Billing (Stripe) and Settings → Owner alerts (Resend) when you are signed in as founder.

**Important:** Change `prisma/schema.prisma` provider to `postgresql` and run migrations before production scale. For first deploy testing, Turso SQLite-compatible works.

**Schema migrations on build (`scripts/turso-migrate.mjs`):** the build migrates a remote (Turso) database only when `VERCEL_ENV=production`. A Preview or unknown build whose `DATABASE_URL` points at a remote database fails with "turso-migrate refused" instead of touching it. Owner actions:

1. In Vercel → Settings → Environment Variables, scope the production `DATABASE_URL` to **Production only**. Give Preview either nothing (file-backed SQLite) or its own isolated Turso database.
2. If Preview has its own isolated Turso database and should be migrated, set `TURSO_MIGRATE_CONFIRM` to that database's host (for example `orvius-preview-you.turso.io`) in the **Preview** scope only.
3. To migrate by hand from a laptop, run `TURSO_MIGRATE_CONFIRM=<host> npm run db:migrate:turso`. A confirmation that names a different host than `DATABASE_URL` is refused.

**Paid voice tests (`.github/workflows/voice-gate.yml`):** real Vapi calls run only when you opt in, either by adding the `run-voice-gate` label to a pull request (one run per labelling) or with Actions → Voice gate → Run workflow with "confirm paid calls" ticked. Ordinary PR pushes that touch receptionist files only post a warning. Create the `run-voice-gate` label once in GitHub → Issues → Labels. `voice-nightly.yml` is unchanged: it still places billed calls every night whenever the three `VOICE_SIM_*`/`VAPI_API_KEY` secrets are set. Decide whether to keep that schedule.

## 4. Custom domains

Vercel → Project → Domains:

- `orvius.im`
- `app.orvius.im`
- `api.orvius.im`

## 5. Namecheap DNS

See `docs/DNS-ORVIUS-IM.md` — remove Manus CNAME, add Vercel records.

## 6. After deploy

```bash
# Update Vapi webhook to production
WEBHOOK_BASE_URL=https://api.orvius.im node scripts/configure-vapi-webhook.mjs

# Re-run onboard against production (optional)
NEXT_PUBLIC_APP_URL=https://api.orvius.im npm run onboard
```

## 7. Verify

- `https://orvius.im` — marketing
- `https://app.orvius.im/admin` — business setup
- `https://api.orvius.im/api/health` — green
- `https://orvius.im/pricing` — pilot + Stripe checkout
- Call +18446439170 → lead on dashboard
