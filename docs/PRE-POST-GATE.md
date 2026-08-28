# Pre-post gate

Do **not** post orvius.im publicly until every blocker is cleared.

## Automated check

```bash
npm run pre-post:check
```

Runs health checks + E2E dogfood. Exits non-zero on blockers.

## Manual gate (founder certification)

### Blockers — must pass

- [ ] Call live Twilio number from your phone → lead in `/dashboard`
- [ ] Owner SMS arrives within 30 seconds (owner phone set + `ENABLE_OWNER_SMS=true`)
- [ ] `orvius.im` live on Vercel (not Manus 503)
- [ ] Vapi webhook points to production `https://api.orvius.im/api/webhooks/vapi`
- [ ] One 60–90 sec screen recording of real call → alert → dashboard

### Quality — should pass

- [ ] Homepage + header feel premium on mobile
- [ ] `/dashboard` lead inbox matches homepage product story
- [ ] `/demo` preview matches live behavior
- [ ] `/admin` go-live checklist all green

### Do not post until

```
Blockers = 0
You would put your own shop on Orvius tomorrow
```

## Sequence

1. `npm run pre-post:check` — fix blockers
2. Real phone call test — log in `docs/FAILURE-LOG.md`
3. Deploy (`docs/DEPLOY-VERCEL.md`) + DNS (`docs/DNS-ORVIUS-IM.md`)
4. Re-run pre-post check against production URL:
   ```bash
   APP_URL=https://api.orvius.im npm run pre-post:check
   ```
5. Record proof demo
6. First post — narrow wedge claim only

## First post template

> Orvius answers every call for HVAC, plumbing, and electrical shops — and puts the lead in your hand before your competitor does.
>
> First ten shops · thirty days free · [orvius.im/pilot]

---

*Last updated: 2026-08-28*
