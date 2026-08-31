# DNS setup for orvius.im

Your domain is registered at **Namecheap** (registrar-servers.com).

## Current status (needs fix)

| Record | Current value | Problem |
|--------|---------------|---------|
| `@` CNAME | `cname.manus.space` | Still pointing at Manus |

## Target architecture

| Host | Purpose |
|------|---------|
| `orvius.im` | Marketing website |
| `app.orvius.im` | Admin + dashboard |
| `api.orvius.im` | Twilio + Vapi webhooks |

## Steps (Namecheap)

1. Log in to **Namecheap** → Domain List → **orvius.im** → **Advanced DNS**

2. **Delete** the existing CNAME record pointing to `cname.manus.space`

3. **Deploy Orvius to Vercel** (connect GitHub repo, import project)

4. In **Vercel** → Project → Settings → Domains, add:
   - `orvius.im`
   - `app.orvius.im`
   - `api.orvius.im`

5. Vercel will show exact DNS records. Typically:

   | Type | Host | Value |
   |------|------|-------|
   | A | `@` | `76.76.21.21` |
   | CNAME | `www` | `cname.vercel-dns.com` |
   | CNAME | `app` | `cname.vercel-dns.com` |
   | CNAME | `api` | `cname.vercel-dns.com` |

6. Add those records in Namecheap Advanced DNS

7. Set Vercel environment variables:
   ```
   NEXT_PUBLIC_APP_URL=https://app.orvius.im
   ORVIUS_PRIMARY_DOMAIN=orvius.im
   ORVIUS_APP_DOMAIN=app.orvius.im
   ORVIUS_API_DOMAIN=api.orvius.im
   ```

8. Wait 5–30 min for DNS propagation, then verify:
   - https://orvius.im
   - https://app.orvius.im/admin
   - https://api.orvius.im/api/health

## Webhook URLs (after live)

- Vapi: `https://api.orvius.im/api/webhooks/vapi`
- Twilio SMS: `https://api.orvius.im/api/webhooks/twilio/sms`

## Email (optional, later)

Set up Google Workspace or Namecheap email for:
- `hello@orvius.im`
- `support@orvius.im`
