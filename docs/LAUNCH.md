# Orvius launch — where we are

**Product status:** Built and working locally. **Not live on orvius.im yet.**

Last verified: E2E dogfood passed (calls, SMS, leads, dashboard). Twilio line **+1 844 643 9170** is wired to Vapi.

---

## What the agent already did (code side)

- Marketing site (editorial design) — homepage, pricing, pilot, about, legal
- Product dashboard — inbox, calls, customers (Ring 2)
- Google sign-in flow (code ready, needs your OAuth keys)
- Twilio + Vapi webhooks + owner SMS alerts
- Stripe checkout hooks ($299/mo Pro)
- Legal pages (Solution Development LLC)
- Deploy config (`vercel.json`, DNS docs, deploy scripts)

---

## What only YOU can do (≈45 min total)

### 1. GitHub repo (5 min)

Create empty repo `orvius` on GitHub, then run locally or tell the agent the URL:

```bash
git remote add origin https://github.com/YOUR_USERNAME/orvius.git
git push -u origin cursor/os-ring2-premium-ece6:main
```

### 2. Google Sign-In (10 min)

1. [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. OAuth client → Web application
3. Redirect URIs:
   - `https://orvius.im/api/auth/callback/google`
   - `https://app.orvius.im/api/auth/callback/google`
4. Add to Vercel env:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `AUTH_SECRET` (already in `.env`)
   - Optional: `ORVIUS_AUTH_ALLOWED_EMAILS=marcocarlino2006@gmail.com`

See `docs/AUTH-GOOGLE.md`.

### 3. Production database (10 min)

SQLite **will not persist** on Vercel. Create free DB:

- **Turso** (recommended, SQLite-compatible): [turso.tech](https://turso.tech)
- Or **Neon** Postgres (requires schema change)

Set `DATABASE_URL` in Vercel to the Turso/Neon connection string.

### 4. Deploy to Vercel (10 min)

1. [vercel.com/new](https://vercel.com/new) → Import GitHub repo
2. Paste env vars — run `node scripts/export-vercel-env.mjs` for the list
3. Add domains: `orvius.im`, `app.orvius.im`, `api.orvius.im`

See `docs/DEPLOY-VERCEL.md`.

### 5. Fix DNS on Namecheap (10 min)

**This is why orvius.im shows 503** — still pointed at dead Manus host.

1. Namecheap → orvius.im → Advanced DNS
2. **Delete** CNAME `@` → `cname.manus.space`
3. Add Vercel DNS records (from Vercel dashboard)

See `docs/DNS-ORVIUS-IM.md`.

### 6. After deploy — wire webhooks (5 min)

```bash
WEBHOOK_BASE_URL=https://api.orvius.im node scripts/configure-vapi-webhook.mjs
```

Twilio SMS webhook → `https://api.orvius.im/api/webhooks/twilio/sms`

### 7. Stripe (optional — pilot is free)

When ready for paid subscriptions:

```bash
STRIPE_SECRET_KEY=sk_live_... npm run stripe:setup
```

Add `STRIPE_*` vars to Vercel. Webhook: `https://api.orvius.im/api/billing/webhook`

---

## Verify live

| URL | Expected |
|-----|----------|
| https://orvius.im | Marketing homepage |
| https://orvius.im/login | Google sign-in |
| https://app.orvius.im/dashboard | Dashboard (after login) |
| https://api.orvius.im/api/health | `{"ok":true}` |
| Call +18446439170 | Lead appears in dashboard + SMS to owner |

---

## Quick status command

```bash
npm run deploy:check
```
