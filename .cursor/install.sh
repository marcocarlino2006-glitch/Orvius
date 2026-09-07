#!/usr/bin/env bash
# Idempotent Cloud Agent setup for Orvius (Next.js 15 + Prisma/SQLite).
# Prepares a self-contained local dev stack: no external services required.
set -euo pipefail

cd "$(dirname "$0")/.."

# Local dev env file is gitignored. Create it once with safe local defaults.
# All external integrations (Twilio, Vapi, Stripe, Google OAuth) stay optional;
# sign-in uses the guarded local bypass in src/lib/dev-auth.ts.
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i 's|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=http://localhost:3000|' .env
  sed -i 's|^ENABLE_OWNER_SMS=.*|ENABLE_OWNER_SMS=false|' .env
  sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -hex 32)|" .env
  printf '\n# Local dev sign-in bypass (guarded off in production by src/lib/dev-auth.ts)\nORVIUS_DEV_AUTH_BYPASS=1\n' >> .env
fi

# Install dependencies from the lockfile.
npm ci

# Generate the Prisma client and create/sync the local SQLite database.
npx prisma generate
npm run db:push
