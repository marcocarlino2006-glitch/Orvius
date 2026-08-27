# Attach your Twilio number in Vapi — step by step

Your Orvius assistant is already created. This connects your **real phone line** to the AI.

## Your numbers

| What | Value |
|------|--------|
| Twilio (shop line) | **+1 844 643 9170** |
| Vapi Assistant ID | `efaa2715-7be9-4f25-862d-36f8f67981c6` |
| Business | Summit HVAC |

---

## Steps (Vapi dashboard)

1. Go to [dashboard.vapi.ai](https://dashboard.vapi.ai)
2. Left sidebar → **Phone Numbers**
3. Click **Import** or **Add number** (or select existing if already imported)
4. Choose **Twilio** as provider
5. Connect your Twilio account if prompted (same SID/token as Orvius)
6. Select **+18446439170**
7. Set **Assistant** to: `Summit HVAC Receptionist` (or ID `efaa2715-7be9-4f25-862d-36f8f67981c6`)
8. Save

---

## Webhook (Orvius receives call results)

**Production (after deploy + DNS):**
```
https://api.orvius.im/api/webhooks/vapi
```

**Temporary (tunnel — for testing before DNS):**
Run on the server:
```bash
node scripts/configure-vapi-webhook.mjs https://YOUR.trycloudflare.com
```

Webhook secret must match `VAPI_WEBHOOK_SECRET` in your env.

---

## Twilio SMS (optional)

Twilio Console → Phone Numbers → +18446439170 → Messaging:

```
Webhook: https://api.orvius.im/api/webhooks/twilio/sms
```

---

## Test

1. Call **+1 844 643 9170** from your cell
2. Talk to Orvius — give name, problem, address
3. Hang up
4. Open `/dashboard` — lead should appear within ~30 seconds

---

## If the call doesn't connect

- Phone not attached to assistant in Vapi
- Webhook URL not reachable (need deploy or tunnel)
- Twilio trial account — verify your cell in Twilio Console first
