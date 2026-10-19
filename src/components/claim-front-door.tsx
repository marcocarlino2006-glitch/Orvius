"use client";

import Link from "next/link";
import { useState } from "react";
import { TRADES } from "@/lib/trades";
import { SIGNUP_HREF } from "@/lib/signup-href";

/**
 * The claim is the top of the network: a named, shareable front-door link for
 * one business. It persists nothing and buys nothing — following the link
 * opens the preview with the shop already filled in, and signing up is what
 * turns the same name into a live line.
 */
export function ClaimFrontDoor({ compact = false }: { compact?: boolean }) {
  const [name, setName] = useState("");
  const [trade, setTrade] = useState<string>("HVAC");
  const [claimed, setClaimed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const shop = name.trim();
  const claimPath =
    shop.length >= 2
      ? `/try?shop=${encodeURIComponent(shop)}&trade=${encodeURIComponent(trade)}&utm_source=claim&utm_medium=front-door`
      : null;

  return (
    <div className="ov-claim font-sans">
      <form
        className="ov-claim-form"
        onSubmit={(e) => {
          e.preventDefault();
          setClaimed(claimPath);
          setCopied(false);
        }}
      >
        <label className="ov-claim-field">
          <span>Business name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Summit Heating & Air"
            autoComplete="organization"
            required
            minLength={2}
          />
        </label>
        <label className="ov-claim-field">
          <span>What you do</span>
          <select value={trade} onChange={(e) => setTrade(e.target.value)} aria-label="What you do">
            {TRADES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="ov-btn ov-btn--solid ov-claim-submit" disabled={!claimPath}>
          Claim your front door
        </button>
      </form>

      {claimed ? (
        <div className="ov-claim-card" role="status">
          <p className="ov-claim-shop">
            {shop} · {trade}
          </p>
          <p className="ov-claim-link">{`orvius.im${claimed}`}</p>
          <p className="ov-claim-note">
            That link opens your preview with your shop already in it — hear it answer, then share the call.
            Claiming is free and saves nothing on our side; signing up is what turns this name into a live line
            that answers your real calls.
          </p>
          <div className="ov-claim-actions">
            <Link href={claimed} className="ov-btn ov-btn--solid">
              Hear it answer as {shop}
            </Link>
            <button
              type="button"
              className="ov-btn ov-btn--quiet"
              onClick={() => {
                const url = `${window.location.origin}${claimed}`;
                void navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => setCopied(false));
              }}
            >
              {copied ? "Link copied" : "Copy your link"}
            </button>
            {!compact ? (
              <Link href={SIGNUP_HREF} className="ov-btn ov-btn--quiet">
                Make it live
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
