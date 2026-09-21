"use client";

import Link from "next/link";
import {
  buildSettingsHub,
  type SettingsHubInput,
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
 * Settings resume — one next action only. No progress theater, no card grid.
 */
export function SettingsLaunchGuide({ input }: SettingsLaunchGuideProps) {
  const hub = buildSettingsHub(input);

  if (!hub.next) {
    return (
      <section className="settings-hub settings-hub--done font-sans" aria-label="Settings hub">
        <div className="settings-hub-head">
          <div>
            <p className="settings-hub-kicker">Setup</p>
            <h2 className="settings-hub-title">Shop setup is complete</h2>
            <p className="settings-hub-lead">
              Capture, alerts, and billing stay reachable below anytime.
            </p>
          </div>
          <div className="settings-hub-actions">
            <Link href="/dashboard" className="btn btn-void text-sm">
              Back to Command
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="settings-hub font-sans" aria-label="Settings hub">
      <div className="settings-hub-head">
        <div>
          <p className="settings-hub-kicker">Next</p>
          <h2 className="settings-hub-title">{hub.next.title}</h2>
          <p className="settings-hub-lead">{hub.next.body}</p>
        </div>
        <div className="settings-hub-actions">
          <button
            type="button"
            className="btn btn-void text-sm"
            onClick={() => jumpTo(hub.next!.href)}
          >
            {hub.next.cta}
          </button>
        </div>
      </div>
    </section>
  );
}
