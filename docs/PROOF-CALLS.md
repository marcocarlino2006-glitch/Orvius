# Proof calls

Nothing in the repo shows a real person calling a shop's own line and the whole chain working on production. Simulated callers and local tests cover the code. These calls cover the product. Run them on one real shop's dedicated line (not the shared demo line, which books into a sample workspace), with a second phone for the caller and your own cell as the owner number.

Write down the time of each step. A step that takes longer than the limit below is a finding even if it works.

## Before the first call

1. `curl https://orvius.im/api/health`: `release.commit` equals the commit you mean to test.
2. Settings → Receptionist: voice, alerts, booking and payments each read "ready". Anything "waiting" is a finding. Texting customers reads "waiting" until the toll-free number is verified; note it and keep going.
3. The shop has open hours saved, a technician or the owner as the person who runs jobs, and a time already booked tomorrow at 2 PM (so you can test a busy slot).
4. Twilio console (call and message logs) and Vapi (call list) are open.

## Call 1: an ordinary booking

From the second phone, call the shop's own number. Say the AC is not cooling, it is not an emergency, and you want a visit this week.

| Check | Limit | Where to look |
| --- | --- | --- |
| Answers | within 2 rings | your ear |
| First word after it answers | under 2 seconds | your ear |
| It asks for your name, address and number, and reads the address back correctly | | the call |
| Times it offers sit inside open hours, in the shop's timezone, and skip the 2 PM job | | the call |
| You accept a time | | the call |
| Owner text arrives on your cell | under 60 seconds after hang-up | your phone, Twilio message log |
| A lead and a job exist for that time | within 2 minutes | Command, Jobs |
| Calls page shows the call as Booked with a job attached | | Calls |
| Customer confirmation text | arrives, or the desk shows it held with a reason | caller phone, Inbox |
| Tap the confirm link | the job reads confirmed | the link, Jobs |

## Call 2: a gas smell

Call again. Say you smell gas in the kitchen.

| Check | Where to look |
| --- | --- |
| It does not book a visit | Jobs |
| It tells you to leave the house and call 911 or the gas company | the call |
| The owner is alerted immediately and the call is marked a safety call | your phone, Calls |

## Call 3: the same time twice

Book Call 1's time again from a third phone while someone else is on the line asking for it, or call twice in a row asking for the same slot. Only one job may exist at that time.

## Afterwards: money

1. Open the job, assign it, mark it complete with $1.00 as the amount.
2. The invoice shows $1.00 plus tax if a rate is set. Pay it with your own card from the pay link, then refund it in Stripe.
3. The desk shows the bill paid. Complete a second job as no charge and confirm no invoice or pay link is created.

## Record the result

For every row above: pass, fail, or not tested, the time, and what you saw. Send the fails. Then run Call 1 again after any fix.

A pass here is evidence for these three calls on this day, on this shop's line. It does not prove other shops, other accents, or busy hours.
