# Wedge mastery

**The wedge:** Inbound call or SMS → qualify → lead in dashboard → owner alert.

Master this before anything else.

## One-command setup

```bash
# Terminal 1 — keep dev server running
npm run dev

# Terminal 2 — tunnel (required for live calls until Vercel deploy)
npx cloudflared tunnel --url http://127.0.0.1:3000 2>&1 | tee /tmp/orvius-tunnel.log

# Terminal 3 — master the wedge
npm run master:wedge
```

This runs: setup check → restore live phones → sync prompt → Vapi webhook → phone attach → E2E → edge-case drill.

## Founder certification (real phone)

Call **your Twilio number** from your cell.

**Important:** Set `ORVIUS_OWNER_PHONE` in `.env` to **your personal cell** — not the Twilio line. Otherwise owner SMS alerts go nowhere useful.

Complete this script:

| # | Scenario | Pass criteria |
|---|----------|---------------|
| 1 | AC emergency after hours | Name, phone, service, urgency, address captured |
| 2 | "Can I talk to someone?" | Offers 15-min callback, captures number |
| 3 | Plumbing estimate, not urgent | Urgency = this-week or flexible |
| 4 | Hang up mid-call | Partial lead OK, no crash |
| 5 | Inbound SMS | Lead + auto-reply |

After each: lead in `/dashboard`, owner SMS if enabled.

Log every miss in `docs/FAILURE-LOG.md`. Zero repeat failures.

## Internal drills (no phone)

```bash
npm run e2e:dogfood      # happy path
npm run wedge:drill      # edge cases
npm run pre-post:check   # full gate
```

## Scripts reference

| Command | Purpose |
|---------|---------|
| `npm run master:wedge` | Full wedge setup + drills |
| `npm run restore:phones` | Fix DB phones after e2e (uses .env) |
| `npm run sync:prompt` | Push latest receptionist prompt to Vapi |
| `npm run go-live` | Tunnel + webhook + phone (dev) |

## Mastery bar

You are wedge-certified when:

- [ ] 5 founder call scenarios pass on real phone
- [ ] Owner SMS arrives &lt;30s every time
- [ ] Dashboard matches what happened on the call
- [ ] Every inbound lead auto-books to dispatch (call + SMS)
- [ ] Unassigned jobs get a tech from Today in one tap
- [ ] You'd put your own shop on Orvius tomorrow
- [ ] Failure log has zero blockers

---

*Last updated: 2026-09-02*
