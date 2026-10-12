# Orvius public launch kit

Every line below is something orvius.im does today. Check the publish gate at
the bottom before posting.

## Positioning

**One line:** The operating system for businesses that run on the phone.
Trades first: HVAC, plumbing and electrical.

**What it does today:** Orvius answers the shop's calls in the shop's name,
qualifies the job, offers an open time from the shop's real schedule, books it,
texts the customer to confirm and the owner what happened. Command then runs
the day: who's on which job, who hasn't confirmed, what's at risk, and what got
paid.

**Proof anyone can check:** Call the live line, **+1 844 643 9170**. It's the
same receptionist a shop's callers get. Or press "Talk to it in your browser" on the
homepage: it uses the microphone, needs no account, and ends after 3 minutes.

**Conversion:** Sign up and get a line at **orvius.im** (self-serve, card
checkout). Plans from $199 a month, or $166 a month billed yearly. First 30
days money back, once per shop.

Summit HVAC on the site is a labeled sample shop, not a customer. Don't call it
one.

---

## Manus-style launch post (X / Threads)

> I'm 20. I built Orvius, the operating system for trade shops that run on the phone.
>
> Call it right now: +1 844 643 9170
>
> It answers like your receptionist, books the job into a real open time, texts the customer to confirm and texts you what happened.
>
> Then it runs the day: who's on which job, who hasn't confirmed, what got paid.
>
> HVAC, plumbing, electrical. Live today: orvius.im

Thread follow-ups, one per post:

1. **The problem.** A shop owner is on a roof when the phone rings. The caller
   doesn't leave a voicemail. They call the next shop. Orvius picks up in the
   shop's name and gets the job on the board.
2. **It books real times.** It checks the shop's hours, each technician's
   schedule and time off, a connected Google/iCloud/Outlook calendar, and
   Jobber, Housecall Pro or ServiceTitan before offering a time. If it can't
   read the calendar, it says so and takes details instead of guessing.
3. **Safety first.** A gas smell, a carbon monoxide alarm or sparking wires
   isn't booked for Tuesday. The caller is told to get out and call 911 or the
   utility, and the owner is alerted to call back now.
4. **It's honest.** Every call is recorded and summarized. Every booking, text
   and change is in the activity log. No made-up numbers on the site, no fake
   customers.
5. **Try it.** Call +1 844 643 9170 and pretend your AC died, or talk to it in
   your browser on orvius.im. Then get your own line there.

## LinkedIn

> Trade shops don't lose work because they're bad at the trade. They lose it because the owner is on a job when the phone rings, and the caller calls the next shop.
>
> I built Orvius to fix that, and then to run the rest of the day.
>
> When a call comes in, Orvius:
> - answers in the shop's name, in English or Spanish;
> - captures the job, urgency, address and callback number;
> - offers an open time from the shop's real schedule and books it;
> - texts the customer to confirm and the owner what happened;
> - tells a caller with a gas smell or sparking wires to get safe and call 911, and alerts the owner to call back now.
>
> Then Command shows the owner the day: who's on which job, who hasn't confirmed, what's at risk and what got paid.
>
> It's live today for HVAC, plumbing and electrical shops. Call the same receptionist your customers would get: +1 844 643 9170.
>
> orvius.im

## Short caption (video or image)

> Your crew shouldn't have to stop working to answer the phone. Call Orvius: +1 844 643 9170. orvius.im

---

## Assets

1. **Social card:** the homepage preview image (orvius.im/opengraph-image),
   1200 × 630, black with the live number.
2. **Product video:** a 41-second walkthrough of the homepage, from the live
   call panel to the closing live number. The labeled sample shop is fine to
   show. Recorded from orvius.im on Oct 12, 2026; re-record if the homepage
   changes.
3. **Best possible clip:** your own phone screen recording a real call to the
   live line, followed by the owner text arriving. Only you can record this,
   and it's the strongest proof you can post.

Lead with the phone ringing. Don't lead with Settings, a pricing table or AI
buzzwords.

## Never write

- "Never miss a call", "answers every call", "guaranteed", "100%", "24/7
  coverage" as a promise, "fully autonomous".
- Customer counts, revenue, "recovered $X" or any number we haven't measured.
- "Summit HVAC" as a customer or case study.
- That Orvius books into Jobber/Housecall Pro/ServiceTitan calendars. It
  sends them each call and reads their schedules; it doesn't write visits into
  them.

---

## Publish gate

Automated, from any machine:

```bash
PROD_URL=https://orvius.im npm run -s prod:verify
```

Must show 0 failed. It checks hostnames, that private data stays behind
sign-in, that call providers, owner texts, Stripe checkout and signup are
live, and that production runs the latest merged code.

Founder only, before the first post:

- [ ] Call +1 844 643 9170 from your own phone. It answers as Orvius, gives the
      recording disclosure, and books a time without inventing a price.
- [ ] Say you smell gas. It tells you to leave and call 911.
- [ ] Press "Talk to it in your browser" on the homepage and have a short
      conversation. It's the easiest way for people to try it from the post.
- [ ] Sign up a test shop with a real card, then refund it in Stripe.
- [ ] Set `ORVIUS_ADMIN_KEY` in Vercel so you can watch signups and calls on
      `/admin` while the post is up.
- [ ] Twilio shows the live number's texting registration (toll-free
      verification for the 844 number) as approved. Unregistered texts get
      filtered by carriers.
- [ ] hello@orvius.im is forwarding to an inbox you check. It's the only support
      channel.
