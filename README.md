# Orvius

AI receptionist MVP for home service businesses. Own the code, Twilio, and Vapi — no black-box vendor.

## What this does

- Creates a **Vapi assistant** per business from admin UI
- Receives **Vapi webhooks** on call completion
- Stores **calls + leads** in SQLite (via Prisma)
- Sends **owner SMS alerts** via Twilio when a lead is captured
- Provides a simple **dashboard** to monitor activity

## Stack

- Next.js 15 (App Router)
- Prisma + SQLite
- Twilio (SMS)
- Vapi (voice AI)

## Quick start

1. **Install dependencies**

```bash
npm install
```

2. **Configure environment**

```bash
cp .env.example .env
```

Fill in:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Default `file:./dev.db` works for local dev |
| `NEXT_PUBLIC_APP_URL` | Public URL (use ngrok for local webhook testing) |
| `TWILIO_ACCOUNT_SID` | From Twilio console |
| `TWILIO_AUTH_TOKEN` | From Twilio console |
| `TWILIO_PHONE_NUMBER` | Your Twilio number (E.164) for owner SMS |
| `VAPI_API_KEY` | From Vapi dashboard |
| `VAPI_WEBHOOK_SECRET` | Optional secret sent as `x-vapi-secret` header |

3. **Initialize database**

```bash
npm run db:generate
npm run db:push
```

4. **Run locally**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Setup flow

1. Go to `/admin` and create a business (auto-creates Vapi assistant)
2. In **Vapi dashboard**, connect your Twilio number to that assistant
3. Set Vapi server URL to: `https://YOUR_DOMAIN/api/webhooks/vapi`
4. Set server URL secret to match `VAPI_WEBHOOK_SECRET` if used
5. Place a test call → check `/dashboard` for lead + owner SMS

## Project structure

```
src/
  app/
    admin/          # Business setup UI
    dashboard/      # Calls & leads monitor
    api/
      businesses/   # CRUD + Vapi assistant provisioning
      webhooks/vapi/# Call events + lead capture
  lib/
    business.ts     # Prompts + business helpers
    vapi.ts         # Vapi API client
    notifications.ts# Owner SMS via Twilio
prisma/
  schema.prisma   # Business, Call, Lead models
```

## Deploy

Deploy to Vercel/Railway/Fly with:

- `NEXT_PUBLIC_APP_URL` set to production URL
- Postgres recommended for production (change `provider` in `schema.prisma`)
- Run `prisma db push` or migrations on deploy

## Roadmap (next builds)

- [ ] SMS receptionist (Twilio inbound SMS)
- [ ] Calendar booking integration
- [ ] Structured data extraction in Vapi assistant
- [ ] Auth for admin/dashboard
- [ ] Per-business analytics (lead capture rate)

## License

Private — Orvius
