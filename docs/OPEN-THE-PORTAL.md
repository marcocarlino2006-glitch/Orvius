# Open the portal

The ordered runbook for turning public signup on. Order is the strategy:
slow approvals start first and run in parallel, instant switches wait, and
the signup switch is always the last move. The admin launch gate
(`/admin`, "Open the portal, in this order") shows this same list live,
with only the steps still pending.

Do NOT reorder. Filing step 1 last adds business days of dead waiting to
launch day.

## The sequence

1. **File toll-free verification** (slowest — business days).
   Admin → Launch gate → "Texts reach phones" form files it with Twilio.
   Customer texts stay held until status is `TWILIO_APPROVED`, but signup
   does not have to wait for approval to open — alerts email in the
   meantime. File it first regardless.

2. **Resend key + domain DNS** (propagation runs itself).
   `RESEND_API_KEY` in Vercel; verify `orvius.im` in Resend → Domains
   (three DNS records). Unlocks sign-in email backup, owner alerts,
   dunning.

3. **Stripe prices** (`npm run stripe:setup` prints the IDs).
   Paste `STRIPE_PRICE_ID_*` into Vercel. Do not rename or reuse existing
   price IDs.

4. **Google sign-in** (minutes). Auth env in Vercel per the gate's fix list.

5. **Twilio + Vapi keys** (copy-paste). `TWILIO_ACCOUNT_SID`,
   `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `VAPI_API_KEY`.

6. **Per-shop line provisioning** — turns green with step 5's keys.

7. **Voice webhook secret** — one long random value, set identically in
   Vercel (`VAPI_WEBHOOK_SECRET`) and in Vapi (server secret).

8. **Formation state** — `ORVIUS_FORMATION_STATE`, the state Solution
   Development LLC is organized in.

9. **Flip `ORVIUS_SELF_SERVE_SIGNUP=1`** — always last. With every step
   above green, signup opens the moment this deploys.

## After the switch

- Admin shows the loop live: Launch funnel (claim → hear it → share →
  sign up → pay), founding-cohort spots taken/left, Proof kit per shop,
  Density by trade × metro.
- Watch the first proof shop like a hawk: booking rate and the listed
  gallery call are the assets that sell shop #2 through #10.
