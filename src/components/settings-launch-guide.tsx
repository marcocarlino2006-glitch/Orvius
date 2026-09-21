"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import {
  buildSettingsHub,
  type SettingsHubInput,
  type SettingsHubItem,
  type SettingsHubNext,
} from "@/lib/settings-hub";

const DISMISS_KEY = "orvius-settings-guide-dismissed";

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

export function SettingsLaunchGuide({ input }: SettingsLaunchGuideProps) {
  const titleId = useId();
  const hub = buildSettingsHub(input);
  const incomplete = hub.doneCount < hub.totalCount;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!incomplete) {
      setOpen(false);
      return;
    }
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* ignore */
    }
    setOpen(true);
  }, [incomplete]);

  function dismiss() {
    setOpen(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  function takeNext(next: SettingsHubNext) {
    dismiss();
    jumpTo(next.href);
  }

  function takeItem(item: SettingsHubItem) {
    setOpen(false);
    jumpTo(item.href);
  }

  return (
    <>
      <section className="settings-hub font-sans" aria-label="Settings hub">
        <div className="settings-hub-head">
          <div>
            <p className="settings-hub-kicker">Setup hub</p>
            <h2 className="settings-hub-title">
              {hub.doneCount}/{hub.totalCount} ready
            </h2>
            <p className="settings-hub-lead">
              One place to reach capture, alerts, billing, and the rest. Finish
              the next step — then work from Command.
            </p>
          </div>
          <div className="settings-hub-actions">
            {hub.next ? (
              <button
                type="button"
                className="btn btn-void text-sm"
                onClick={() => setOpen(true)}
              >
                Open setup guide
              </button>
            ) : (
              <Link href="/dashboard" className="btn btn-void text-sm">
                Back to Command
              </Link>
            )}
          </div>
        </div>

        <div
          className="settings-hub-progress"
          role="progressbar"
          aria-valuenow={hub.doneCount}
          aria-valuemin={0}
          aria-valuemax={hub.totalCount}
          aria-label="Settings setup progress"
        >
          <span
            className="settings-hub-progress-fill"
            style={{
              width: `${hub.totalCount ? (hub.doneCount / hub.totalCount) * 100 : 0}%`,
            }}
          />
        </div>

        <ul className="settings-hub-grid">
          {hub.items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`settings-hub-card ${item.ok ? "is-ok" : "is-open"}`}
                onClick={() => takeItem(item)}
              >
                <span className="settings-hub-card-mark" aria-hidden>
                  {item.ok ? "✓" : "○"}
                </span>
                <span className="settings-hub-card-copy">
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {open && hub.next ? (
        <div
          className="settings-guide"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <button
            type="button"
            className="settings-guide-backdrop"
            aria-label="Close setup guide"
            onClick={dismiss}
          />
          <div className="settings-guide-card">
            <p className="settings-guide-kicker">
              Next · {hub.doneCount}/{hub.totalCount} complete
            </p>
            <h2 id={titleId} className="settings-guide-title">
              {hub.next.title}
            </h2>
            <p className="settings-guide-body">{hub.next.body}</p>

            <button
              type="button"
              className="btn btn-void settings-guide-primary"
              onClick={() => takeNext(hub.next!)}
            >
              {hub.next.cta}
            </button>

            <ul className="settings-guide-list" aria-label="All setup areas">
              {hub.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`settings-guide-row ${item.ok ? "is-ok" : ""}`}
                    onClick={() => takeItem(item)}
                  >
                    <span aria-hidden>{item.ok ? "✓" : "○"}</span>
                    <span>
                      <strong>{item.label}</strong>
                      <em>{item.detail}</em>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="settings-guide-foot">
              <button
                type="button"
                className="settings-guide-later"
                onClick={dismiss}
              >
                Not now — stay on Settings
              </button>
              <Link href="/dashboard" className="settings-guide-command" onClick={dismiss}>
                Command
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
