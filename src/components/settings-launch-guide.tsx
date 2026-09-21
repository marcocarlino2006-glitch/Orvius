"use client";

import Link from "next/link";
import {
  buildSettingsHub,
  type SettingsHubInput,
  type SettingsHubItem,
} from "@/lib/settings-hub";

type SettingsLaunchGuideProps = {
  input: SettingsHubInput;
};

function jumpTo(href: string) {
  if (href.startsWith("/")) {
    window.location.assign(href);
    return;
  }
  const id = href.replace(/^#/, "");
  const el = document.getElementById(id);
  if (!el) return;

  const details = el.closest("details");
  if (details) details.open = true;
  if (el instanceof HTMLDetailsElement) el.open = true;

  requestAnimationFrame(() => {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

/**
 * Settings resume — one next CTA, no auto-modal checklist.
 * Incomplete rows stay as quiet jump links under the next action.
 */
export function SettingsLaunchGuide({ input }: SettingsLaunchGuideProps) {
  const hub = buildSettingsHub(input);
  const openItems = hub.items.filter((item) => !item.ok);

  function takeItem(item: SettingsHubItem) {
    jumpTo(item.href);
  }

  return (
    <section className="settings-hub font-sans" aria-label="Settings hub">
      <div className="settings-hub-head">
        <div>
          <p className="settings-hub-kicker">Setup</p>
          <h2 className="settings-hub-title">
            {hub.next
              ? hub.next.title
              : "Shop setup is complete"}
          </h2>
          <p className="settings-hub-lead">
            {hub.next
              ? hub.next.body
              : "Capture, alerts, and billing are reachable from here anytime."}
          </p>
        </div>
        <div className="settings-hub-actions">
          {hub.next ? (
            <button
              type="button"
              className="btn btn-void text-sm"
              onClick={() => jumpTo(hub.next!.href)}
            >
              {hub.next.cta}
            </button>
          ) : (
            <Link href="/dashboard" className="btn btn-void text-sm">
              Back to Command
            </Link>
          )}
        </div>
      </div>

      {hub.next ? (
        <p className="settings-hub-count font-sans">
          {hub.doneCount}/{hub.totalCount} done
        </p>
      ) : null}

      {openItems.length > 0 ? (
        <ul className="settings-hub-grid">
          {openItems.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="settings-hub-card is-open"
                onClick={() => takeItem(item)}
              >
                <span className="settings-hub-card-mark" aria-hidden>
                  ○
                </span>
                <span className="settings-hub-card-copy">
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
