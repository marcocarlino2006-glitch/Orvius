# Orvius — shop forward one-pager

Hand this to every pilot owner. Same content as `/pilot/forward` and `npm run pilot:onboard`.

## What Orvius does

- Answers the **Orvius line** (and any calls you forward to it)
- Qualifies: name, phone, service, urgency, address
- Proposes a job window and texts the customer a **confirm link**
- Texts you the lead summary (email failover if SMS fails)
- Keeps one shop record for leads, jobs, and weekly proof

## What Orvius does not do (yet)

- Catch calls on your public number **unless you forward**
- Treat a proposed window as a locked appointment until the customer confirms
- Take card money into your shop bank until Stripe Connect charges **and** payouts are live
- Sync Jobber / ServiceTitan
- Guarantee “zero missed jobs” or 100% answer rate

## How to forward

1. Keep your public number on Google, trucks, and ads.
2. Set **missed / busy / no-answer / after-hours** forward to your Orvius line:
   - Verizon: dial `*71` + Orvius digits, or account → Call forwarding
   - AT&T: dial `*92` + Orvius digits, or myAT&T → Call forwarding
   - T-Mobile: dial `**61*` + Orvius digits + `#`, or T-Life → Call forwarding
   - VoIP / business line: after-hours / no-answer / busy routes → Orvius
3. Or publish the Orvius line as your main number.
4. Place a live test call to the **Orvius** line → prove it answers.
5. Reply **DONE** from your owner phone, or confirm capture in Settings — only after forward is real.

## Go-live check

- [ ] Orvius line answers a real call
- [ ] Owner cell gets the alert (not the Twilio line)
- [ ] Customer confirm SMS / link works after a book
- [ ] Overflow forward confirmed — or you told them honestly
- [ ] Avg ticket + before-Orvius baselines set
- [ ] Founder phone cert 5/5 stamped

## Say on every sale

- “We catch what hits the Orvius line — forward missed and after-hours, or publish this number.”
- “Booked means proposed until the customer confirms.”
- “Card pay on estimates is Orvius checkout until Connect.”

## CLI

```bash
npm run pilot:onboard -- --name "Summit HVAC" --owner-phone +15551234567 --public-phone +15559876543
npm run pilot:onboard -- --slug summit-hvac --print-only
```
