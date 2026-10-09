import Link from "next/link";
import type { Replay } from "@/lib/call-replay-copy";

const firstLine = (call: Replay, who: "ai" | "caller") => call.turns.find((t) => t.who === who)?.text ?? "";
const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Real shared calls as cards; says plainly when there are none yet. */
export function GalleryGrid({ calls, emptyNote }: { calls: Replay[]; emptyNote?: string }) {
  if (calls.length === 0) {
    return (
      <p className="gal-empty font-sans">
        {emptyNote ?? "No shop has shared a call yet. The first ones appear here as soon as an owner shares one and the caller agrees."}
      </p>
    );
  }
  return (
    <ul className="gal-grid">
      {calls.map((call) => (
        <li key={call.id}>
          <Link href={`/calls/${call.id}`} className="gal-card">
            <span className="gal-meta font-sans">
              {call.trade}
              {call.capture?.outcome ? ` · ${call.capture.outcome}` : ""}
            </span>
            <span className="gal-shop">{call.shopName}</span>
            <span className="gal-quote font-sans">
              <strong>Caller:</strong> {clip(firstLine(call, "caller"))}
            </span>
            <span className="gal-quote font-sans">
              <strong>Orvius:</strong> {clip(firstLine(call, "ai"))}
            </span>
            <span className="gal-open font-sans">Read the call</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
