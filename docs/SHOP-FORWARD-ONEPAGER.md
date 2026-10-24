# Orvius — shop forward one-pager

Hand this to every pilot owner. Same content as `/pilot/forward` and `npm run pilot:onboard`.

## What Orvius does

- Answers the calls you forward from the number customers already call
- Qualifies: name, phone, service, urgency, address
- When the caller picks a time, the job is booked and they hear that time
- A window that was only proposed still texts a **confirm link**
- Texts you the lead summary (email failover if SMS fails)
- Keeps one shop record for leads, jobs, and weekly proof

## What Orvius does not do (yet)

- Catch calls on your public number **unless you forward**. Orvius can't change the carrier's setting.
- Treat a window the caller did not pick as a locked appointment until they confirm the text
- Pay estimate card money into your shop bank (Stripe Connect later)
- Sync Jobber / ServiceTitan
- Guarantee “zero missed jobs” or 100% answer rate

## How to forward

1. Keep your public number on Google, trucks, and ads.
2. From the phone that owns it, dial the every-call code so Orvius answers. That is a setting, not an application.
3. Or send only the calls you don't answer, or publish the Orvius line as a new main number.
4. Call the business number from another phone. Orvius should answer, and the business phone should stay quiet.
5. Settings marks it working when that call arrives. A line existing is not proof.

## Go-live check

- [ ] Orvius line answers a real call
- [ ] Owner cell gets the alert (not the Twilio line)
- [ ] Customer receipt, or confirm text for a proposed window, works
- [ ] Overflow forward confirmed — or you told them honestly
- [ ] Avg ticket + before-Orvius baselines set
- [ ] Founder phone cert 5/5 stamped

## Say on every sale

- “Customers keep their number. One code sends every call to Orvius. We only catch what you forward.”
- “If they picked the time on the call, they're booked. A window they did not pick still confirms by text.”
- “Card pay on estimates is Orvius checkout until Connect.”

## CLI

```bash
npm run pilot:onboard -- --name "Summit HVAC" --owner-phone +15551234567 --public-phone +15559876543
npm run pilot:onboard -- --slug summit-hvac --print-only
```
