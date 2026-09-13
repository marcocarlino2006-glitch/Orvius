# Orvius

**The night-shift OS for HVAC, plumbing, and electrical.**

Orvius answers after-hours and overflow calls, qualifies the job, alerts the owner, and compounds one shop record — Capture → Record → Command → Proof. Not an AI receptionist bolted onto a CRM.

## Product wedge (master this before marketing)

1. Dedicated shop line  
2. Line tested end-to-end  
3. Owner mobile configured  
4. Owner alert delivered  
5. First lead in inbox  
6. Lead auto-books to dispatch  
7. Shop health clear  
8. Founder phone cert (dogfood)

```bash
npm run wedge:ready
npm run multi-b:check
```

See `docs/WEDGE-MASTERY.md` and `docs/PERFECT-STANDARDS.md`.

## Stack

- Next.js 15 (App Router)
- Prisma + SQLite / Turso
- Twilio (SMS + numbers)
- Vapi (voice)
- Stripe (subscriptions — when live)

## Quick start

```bash
cp .env.example .env
npm install
npm run db:generate && npm run db:push
npm run dev
```

Fill Twilio, Vapi, Auth, and (when ready) Stripe + Resend. Production auth requires `ORVIUS_AUTH_ALLOWED_EMAILS`. Production cron requires `CRON_SECRET`.

## Partner rule

Master product quality on a real line → earn proof → post → then take money.
