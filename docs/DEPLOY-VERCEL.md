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

**Important:** Change `prisma/schema.prisma` provider to `postgresql` and run migrations before production scale. For first deploy testing, Turso SQLite-compatible works.

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
- Call +18446439170 → lead on dashboard
