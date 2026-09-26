import Link from "next/link";
import type { ReactNode } from "react";
import { CARRIERS } from "@/lib/carrier-forward";
import { company } from "@/lib/company";

export type HelpCategory = "Get started" | "Calls" | "Your day" | "Account";

export type HelpArticle = {
  slug: string;
  title: string;
  summary: string;
  category: HelpCategory;
  /** Extra words owners search with that the title doesn't use. */
  keywords: string;
  body: ReactNode;
};

export const HELP_CATEGORIES: HelpCategory[] = ["Get started", "Calls", "Your day", "Account"];

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "set-up-your-line",
    title: "Set up your line",
    summary: "From sign-in to your first answered call: get your number, send calls to it, and prove it with one test call.",
    category: "Get started",
    keywords: "start onboarding new number setup first call",
    body: (
      <>
        <h2>1. Get your Orvius number</h2>
        <p>
          Sign in and your shop gets its own Orvius line. You'll find it under{" "}
          <strong>Settings → Phone line</strong>.
        </p>
        <h2>2. Tell the receptionist about your shop</h2>
        <ul>
          <li>
            <strong>Settings → Business</strong>: your shop name (what callers hear) and your trade, which sets the
            emergency rules.
          </li>
          <li>
            <strong>Settings → Hours &amp; area</strong>: your hours, the services you offer, and the ZIP codes you
            cover.
          </li>
          <li>
            <strong>Settings → Receptionist</strong>: the opening line, the voice, and a number to transfer callers who
            ask for a person.
          </li>
        </ul>
        <h2>3. Send calls to it</h2>
        <p>
          Either forward missed, busy and after-hours calls from your current number, or put the Orvius number on
          Google, your trucks and your ads. <Link href="/help/forward-your-calls">Forwarding steps by carrier →</Link>
        </p>
        <h2>4. Prove it with one call</h2>
        <p>
          Call your public number from a different phone and let it ring. Orvius should answer with your shop name,
          and you should get the lead alert on your mobile. Add your mobile under <strong>Settings → Notifications</strong>{" "}
          and use <strong>Send test</strong> to check alerts without placing a call.
        </p>
      </>
    ),
  },
  {
    slug: "forward-your-calls",
    title: "Forward your calls to Orvius",
    summary: "Keep your current number. Send only the calls you miss — busy, unanswered and after-hours — to your Orvius line.",
    category: "Get started",
    keywords: "call forwarding verizon at&t att t-mobile tmobile voip business phone missed busy no answer publish",
    body: (
      <>
        <p>
          Your public number stays on Google, trucks and ads. You pick up when you can; every call you miss goes to
          Orvius. Codes can differ by plan — if one doesn't work, use your carrier's app or call their support and ask
          for <em>conditional call forwarding</em> (busy, no answer, unreachable).
        </p>
        {CARRIERS.map((carrier) => (
          <section key={carrier.id}>
            <h2>{carrier.label}</h2>
            <ol>
              {carrier.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        ))}
        <h2>Or publish the Orvius number</h2>
        <p>
          If you'd rather Orvius answer every call, put your Orvius number on Google, trucks and ads instead. Callers who
          ask for a person are transferred to the number in <strong>Settings → Receptionist</strong>, or you get a
          callback request.
        </p>
        <h2>Check it worked</h2>
        <p>
          From another phone, call your public number and don't answer. Orvius should pick up with your shop name.
          Under <strong>Settings → Phone line</strong> you can text yourself these steps for your carrier.
        </p>
      </>
    ),
  },
  {
    slug: "what-the-receptionist-does",
    title: "What the receptionist does on a call",
    summary: "What it asks, what it books, and what it will never say — so you know exactly what your callers hear.",
    category: "Calls",
    keywords: "ai receptionist script questions booking emergency gas leak spanish transfer spam disclosure recorded",
    body: (
      <>
        <h2>Every call</h2>
        <ul>
          <li>Answers with your opening line and says the call may be recorded and assisted by an automated receptionist.</li>
          <li>Works out what's wrong and how urgent it is — callers aren't asked to pick a category.</li>
          <li>Takes the service address, name and callback number, and reads numbers back digit by digit.</li>
          <li>If the caller spells a name or street, that spelling is what gets saved.</li>
          <li>Speaks Spanish if the caller does. Your records stay in English.</li>
        </ul>
        <h2>Booking</h2>
        <p>
          When booking on the call is on, it offers up to two open times from your hours, your technicians' existing
          jobs, and <Link href="/help/calendar">busy times on your own calendar</Link>. When the caller picks one, the
          time is held for them and they hear "The shop will confirm with you shortly." Two callers at once are never
          given the same time.
        </p>
        <h2>Emergencies and danger</h2>
        <ul>
          <li>
            Gas smell, a carbon monoxide alarm, smoke or sparking: the first thing the caller hears is to leave the
            home, not touch switches, and call the gas company or 911 from outside. Then it takes their details for an
            urgent callback.
          </li>
          <li>
            No heat, no AC, a leak, or a baby or elderly person at home is marked urgent — it is not treated as danger,
            and those callers are never told to leave.
          </li>
          <li>Emergencies are never booked into a slot; they're marked for your team to call back right away.</li>
        </ul>
        <h2>What it will never do</h2>
        <ul>
          <li>Quote prices, arrival times or technician names.</li>
          <li>Promise a text, an email or a callback time.</li>
          <li>Claim it found or confirmed an earlier request — it can't see your records.</li>
          <li>Read a returning caller's address or history before they've confirmed their name.</li>
        </ul>
        <h2>Other callers</h2>
        <p>
          Callers who ask for a person are transferred to your number in <strong>Settings → Receptionist</strong> after
          it takes their name and number, or flagged for a callback. Spam and sales calls are ended politely. Callers
          outside your ZIPs or your trade are told it can't take the job.
        </p>
      </>
    ),
  },
  {
    slug: "returning-callers",
    title: "Returning callers",
    summary: "How Orvius recognizes someone who has called before, and what it will and won't say to them.",
    category: "Calls",
    keywords: "repeat customer caller id recognize history",
    body: (
      <>
        <p>
          When a number that has called before rings in, the receptionist gets a private note with the name on file. It
          only asks "Is this [name]?" — it never reads out an address or past jobs to someone who hasn't confirmed who
          they are.
        </p>
        <p>
          The lead is linked to the same customer record, so you see every call and job for that customer in one
          place. The number is taken from caller ID, so a caller who gives a different callback number still lands on
          the right customer.
        </p>
      </>
    ),
  },
  {
    slug: "lead-alerts",
    title: "Lead alerts",
    summary: "Every new lead is texted to your mobile, with email as the backup. How to set it up and test it.",
    category: "Your day",
    keywords: "notifications sms text email alert owner phone test not getting alerts",
    body: (
      <>
        <ul>
          <li>
            Add your cell (not the shop line) under <strong>Settings → Notifications</strong>. Every new lead is texted
            there.
          </li>
          <li>Your sign-in email is the backup: when a text can't be delivered, the alert goes to email.</li>
          <li>
            <strong>Send test</strong> texts your mobile the way a real lead would.
          </li>
        </ul>
        <p>
          If a confirmation text to a customer fails to deliver, you get an alert to call them instead, so no booking
          is left unconfirmed without you knowing.
        </p>
      </>
    ),
  },
  {
    slug: "calendar",
    title: "Your calendar",
    summary: "See Orvius jobs in Google, Apple or Outlook Calendar — and stop callers being offered times you're busy.",
    category: "Your day",
    keywords: "google calendar apple icloud outlook ical ics feed busy block schedule sync",
    body: (
      <>
        <h2>See your jobs in your calendar</h2>
        <p>
          Under <strong>Settings → Integrations → Jobs calendar feed</strong>, copy the link and subscribe to it in
          Google, Apple or Outlook Calendar. Jobs update about every 15 minutes. The link is private — anyone who has it
          can see your jobs, so don't share it.
        </p>
        <h2>Block times you're busy</h2>
        <p>
          Under <strong>Settings → Integrations → Busy times</strong>, paste your calendar's private address. Any time
          you're busy there is never offered to a caller.
        </p>
        <ul>
          <li>
            <strong>Google</strong>: Google Calendar → Settings → your calendar → Integrate calendar → Secret address in
            iCal format.
          </li>
          <li>
            <strong>Apple</strong>: Calendar → share the calendar as a public calendar and copy the link.
          </li>
          <li>
            <strong>Outlook</strong>: Settings → Calendar → Shared calendars → Publish a calendar → copy the ICS link.
          </li>
        </ul>
        <p>
          Orvius checks it at most every 10 minutes while calls come in. Events marked "free" and cancelled events
          don't block anything. Repeating events and all-day events do. If a check fails, the last good copy keeps
          being used and Settings shows what went wrong.
        </p>
      </>
    ),
  },
  {
    slug: "weekly-results-email",
    title: "The weekly results email",
    summary: "What's in the Monday email, where the numbers come from, and why some weeks show no dollar amount.",
    category: "Your day",
    keywords: "report weekly summary email results roi money booked",
    body: (
      <>
        <p>Once a week, the owner email gets what your line did over the last 7 days:</p>
        <ul>
          <li>Calls answered, requests captured and jobs booked</li>
          <li>After-hours requests and how many were booked</li>
          <li>Emergencies booked and jobs marked complete</li>
          <li>Jobs still waiting for a technician</li>
        </ul>
        <p>
          Dollar amounts only appear for payments you recorded, or as an estimate at the average ticket you set under{" "}
          <strong>Settings → Receptionist</strong>. With neither, the email shows counts only — Orvius never makes up a
          number.
        </p>
        <p>
          If no calls reached your line, the email says so and suggests checking your forwarding. The first email
          arrives after your first full week.
        </p>
      </>
    ),
  },
  {
    slug: "troubleshooting",
    title: "Troubleshooting",
    summary: "Calls not reaching Orvius, alerts not arriving, or something captured wrong — what to check first.",
    category: "Your day",
    keywords: "not working problem help broken calls missing no alerts wrong name fix",
    body: (
      <>
        <h2>Calls aren't reaching Orvius</h2>
        <ol>
          <li>Call your Orvius number directly. If it answers, the line is fine and the issue is forwarding.</li>
          <li>
            Redo the forwarding steps for your carrier: <Link href="/help/forward-your-calls">forward your calls</Link>.
          </li>
          <li>
            Check <Link href="/status">Status</Link> — it shows whether our phone and voice providers are having
            trouble right now.
          </li>
        </ol>
        <h2>Alerts aren't arriving</h2>
        <ol>
          <li>
            Check your mobile under <strong>Settings → Notifications</strong> — it must be your cell, not the shop line.
          </li>
          <li>
            Use <strong>Send test</strong>. If texts don't arrive, check your email: alerts fall back there.
          </li>
          <li>If you replied STOP to an Orvius text, reply START to turn texts back on.</li>
        </ol>
        <h2>A detail was captured wrong</h2>
        <p>
          Numbers are read back to every caller, and spelled names are saved as spelled. Names the caller doesn't
          spell are saved as heard, so unusual names can come through wrong — the recording and transcript are on
          the call so you can check.
        </p>
        <h2>Still stuck</h2>
        <p>
          Email <a href={`mailto:${company.supportEmail}`}>{company.supportEmail}</a> with your shop name and roughly
          when the call came in.
        </p>
      </>
    ),
  },
  {
    slug: "billing-and-payouts",
    title: "Billing and payouts",
    summary: "Your plan, and how deposits paid by customers reach your bank account.",
    category: "Account",
    keywords: "price plan subscription stripe payout deposit bank card invoice cancel",
    body: (
      <>
        <p>
          Plans and prices are on the <Link href="/pricing">pricing page</Link>. Your current plan is under{" "}
          <strong>Settings → Billing</strong>.
        </p>
        <p>
          To take deposits from customers, finish payouts under <strong>Settings → Billing</strong>. Payouts run through
          Stripe, and customer payments go to your shop's bank account once that's set up. Until then, deposits stay
          off.
        </p>
        <p>
          Questions about a charge: <a href={`mailto:${company.supportEmail}`}>{company.supportEmail}</a>. See also our{" "}
          <Link href="/refunds">refund policy</Link>.
        </p>
      </>
    ),
  },
  {
    slug: "your-data",
    title: "Your data",
    summary: "Export everything, delete your workspace, and where to read how data is handled.",
    category: "Account",
    keywords: "export download delete privacy security gdpr ccpa recordings transcripts",
    body: (
      <>
        <ul>
          <li>
            <strong>Settings → Data controls → Export</strong> downloads your customers, leads, jobs and money records as
            one file.
          </li>
          <li>
            <strong>Settings → Data controls → Danger zone</strong> deletes your workspace.
          </li>
        </ul>
        <p>
          How call recordings, transcripts and records are stored and who processes them:{" "}
          <Link href="/privacy">Privacy policy</Link> and <Link href="/security">Security</Link>.
        </p>
      </>
    ),
  },
];

export function getHelpArticle(slug: string) {
  return HELP_ARTICLES.find((a) => a.slug === slug) ?? null;
}
