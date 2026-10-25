import type { Metadata } from "next";
import Link from "next/link";
import { ClaimFrontDoor } from "@/components/claim-front-door";
import { EarlyAccessForm } from "@/components/early-access-form";
import { GalleryGrid } from "@/components/gallery-grid";
import { MarketingShell } from "@/components/marketing-shell";
import { TalkInBrowser } from "@/components/talk-in-browser";
import { listGallery } from "@/lib/call-gallery";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";
import { launchCapacity } from "@/lib/launch-capacity";
import { getPublicLaunchReadiness } from "@/lib/public-launch-readiness";
import { SIGNUP_HREF } from "@/lib/signup-href";
import "../p/[id]/replay.css";

/* A launch post sends everyone here at once; rebuild at most once a minute. */
export const revalidate = 60;

export const metadata: Metadata = {
  alternates: { canonical: "/launch" },
  title: "I built Orvius. Call it.",
  description: "Orvius answers for HVAC, plumbing and electrical shops. Call the live line, then get your own.",
};

function LaunchVideo({ src, poster }: { src: string; poster?: string }) {
  const file = /\.(mp4|webm|mov)(\?|$)/i.test(src);
  return (
    <div className="lx-video">
      {file ? (
        <video src={src} poster={poster} controls playsInline preload="metadata" />
      ) : (
        <iframe src={src} title="Orvius answering a call" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
      )}
    </div>
  );
}

export default async function LaunchPage() {
  const [calls, capacity] = await Promise.all([listGallery(6).catch(() => []), launchCapacity().catch(() => null)]);
  const signupOpen = getPublicLaunchReadiness().ready;
  const video = process.env.ORVIUS_LAUNCH_VIDEO_URL?.trim();
  const spotsLeft = capacity?.left ?? null;
  const canStart = signupOpen && (spotsLeft == null || spotsLeft > 0);

  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact lx-hero">
        <div className="editorial-wrap lx-wrap">
          <p className="tier1-eyebrow type-eyebrow">For HVAC, plumbing and electrical shops</p>
          <h1 className="lx-title">I built this. Call it.</h1>
          <p className="lx-lead font-sans">
            Orvius is the night shift for shops that run on the phone. It answers, books the job, and leaves the day on the desk. This line is the same receptionist a shop&apos;s callers get.
          </p>
          <a href={demoLineHref()} className="lx-bang">
            <span>Call the live line</span>
            <strong>{DEMO_LINE_DISPLAY}</strong>
          </a>
          {video ? <LaunchVideo src={video} poster={process.env.ORVIUS_LAUNCH_VIDEO_POSTER?.trim() || undefined} /> : null}
          <TalkInBrowser personal phoneHref={demoLineHref()} phoneDisplay={DEMO_LINE_DISPLAY} />
          <p className="lx-alt font-sans">
            Rather use your phone? Call <a href={demoLineHref()}>{DEMO_LINE_DISPLAY}</a>. You&apos;ll reach a demo HVAC shop.
          </p>
        </div>
      </section>

      <section className="tier1-story" id="claim">
        <div className="editorial-wrap lx-wrap">
          <p className="tier1-eyebrow type-eyebrow">Claim yours</p>
          <h2 className="tier1-section-title type-headline">Claim your front door.</h2>
          <p className="tier1-section-lead font-sans">
            Your front door is how customers — and the assistants they send — reach you when nobody can pick up.
            Claiming gives you a shareable link in your shop&apos;s name: hear it answer, send the call to another
            owner, and turn the same name into your live line when you sign up.
          </p>
          <div style={{ marginTop: "1.5rem", maxWidth: "36rem" }}>
            <ClaimFrontDoor />
          </div>
        </div>
      </section>

      <section className="tier1-story" id="real-calls">
        <div className="editorial-wrap lx-wrap">
          <p className="tier1-eyebrow type-eyebrow">Real calls</p>
          <h2 className="tier1-section-title type-headline">Calls it answered for working shops.</h2>
          <p className="tier1-section-lead font-sans">Shared by the owners after the caller agreed. Names, numbers and addresses hidden.</p>
          <GalleryGrid
            calls={calls}
            emptyNote="No shop has shared a call yet, so there's nothing here to show. We won't fill this with made-up ones; talk to it above instead."
          />
          {calls.length > 0 ? (
            <p className="lx-alt font-sans">
              <Link href="/calls">All shared calls</Link>
            </p>
          ) : null}
        </div>
      </section>

      <section className="tier1-story tier1-story-muted">
        <div className="editorial-wrap lx-wrap">
          <p className="tier1-eyebrow type-eyebrow">After the call</p>
          <h2 className="tier1-section-title type-headline">The call is where the work starts.</h2>
          <ul className="lx-steps font-sans">
            <li>The job lands on your schedule with what the caller said and where they are.</li>
            <li>The customer gets a text confirming the visit; you get one telling you what came in.</li>
            <li>Your tech sees the job on their phone; the invoice and payment link follow the work.</li>
          </ul>
          <p className="lx-alt font-sans">
            <Link href="/watch">Watch it run a demo shop</Link> (sample data, no account needed).
          </p>
        </div>
      </section>

      <section className="tier1-story" id="get-in">
        <div className="editorial-wrap lx-wrap" style={{ maxWidth: "36rem" }}>
          <p className="tier1-eyebrow type-eyebrow">Getting in</p>
          <h2 className="tier1-section-title type-headline">
            {capacity?.capacity != null
              ? spotsLeft && spotsLeft > 0
                ? `${spotsLeft} of ${capacity.capacity} spots left for new shops in ${capacity.month}.`
                : `${capacity.month} is full.`
              : canStart
                ? "Get your line today."
                : "Join the list."}
          </h2>
          <p className="tier1-section-lead font-sans">
            {capacity?.capacity != null
              ? "We set up every shop's line with them, and every call runs on phone and voice capacity we pay for, so we take on a set number of new shops each month."
              : canStart
                ? "Set up your line, test it from your own phone, and turn it on when you're happy with it."
                : "We're opening shops in order. Leave your details and we'll email you when your spot is ready."}
          </p>
          <div className="tier1-form-slot" style={{ marginTop: "1.25rem" }}>
            {canStart ? (
              <Link href={SIGNUP_HREF} className="ov-btn ov-btn--solid">
                Get your line
              </Link>
            ) : (
              <EarlyAccessForm variant="full" />
            )}
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
