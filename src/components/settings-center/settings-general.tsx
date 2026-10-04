"use client";

import { useEffect, useState } from "react";
import { PushAlertsRows } from "@/components/settings-center/push-alerts-rows";
import { ScGroup, ScRow, ScStatus } from "@/components/settings-center/settings-primitives";
import { LANGS, type Lang } from "@/lib/i18n";
import {
  DARK_QUERY,
  applyResolvedTheme,
  readThemeChoice,
  resolveTheme,
  storeThemeChoice,
  type ThemeChoice,
} from "@/lib/theme";

const LANG_STORAGE_KEY = "orvius-lang";

const THEMES: { choice: ThemeChoice; label: string }[] = [
  { choice: "day", label: "Light" },
  { choice: "night", label: "Dark" },
  { choice: "system", label: "Auto" },
];

export function SettingsGeneral({
  smsOn,
  emailOn,
  smsOptedOut,
}: {
  smsOn: boolean;
  emailOn: boolean;
  smsOptedOut: boolean;
}) {
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>("night");
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    setThemeChoice(readThemeChoice());
    try {
      const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
      if (LANGS.some((entry) => entry.code === stored)) setLang(stored as Lang);
    } catch {
      /* storage blocked — English stands */
    }
  }, []);

  useEffect(() => {
    if (themeChoice !== "system") return;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = () => applyResolvedTheme(resolveTheme("system"));
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [themeChoice]);

  function pickTheme(choice: ThemeChoice) {
    setThemeChoice(choice);
    storeThemeChoice(choice);
    applyResolvedTheme(resolveTheme(choice));
  }

  function pickLang(code: Lang) {
    setLang(code);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, code);
    } catch {
      /* storage blocked — the swap still applies for this session */
    }
    window.dispatchEvent(new CustomEvent("orvius-lang", { detail: code }));
  }

  const textLabel = smsOptedOut ? "Opted out" : smsOn ? "On" : "Off";

  return (
    <>
      <ScGroup title="Appearance">
        <ScRow label="Language">
          <select
            className="sc-select"
            aria-label="Language"
            value={lang}
            onChange={(event) => pickLang(event.target.value as Lang)}
          >
            {LANGS.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.label}
              </option>
            ))}
          </select>
        </ScRow>
        <ScRow label="Theme" stack>
          <div className="sc-theme" role="radiogroup" aria-label="Theme">
            {THEMES.map((entry) => {
              const active = entry.choice === themeChoice;
              return (
                <button
                  key={entry.choice}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={active ? "is-active" : ""}
                  onClick={() => pickTheme(entry.choice)}
                >
                  <ThemeMark choice={entry.choice} />
                  <span>{entry.label}</span>
                </button>
              );
            })}
          </div>
        </ScRow>
      </ScGroup>

      <ScGroup title="Communication preferences">
        <PushAlertsRows />
        <ScRow
          label="Text alerts"
          hint="Your cell gets a text when a call becomes a lead. This is the shop line setting, not a browser switch."
        >
          <ScStatus on={smsOn && !smsOptedOut}>{textLabel}</ScStatus>
        </ScRow>
        <ScRow label="Email backup" hint="Backup alerts go to your sign-in email when a text cannot be delivered.">
          <ScStatus on={emailOn}>{emailOn ? "On" : "Off"}</ScStatus>
        </ScRow>
      </ScGroup>
    </>
  );
}

function ThemeMark({ choice }: { choice: ThemeChoice }) {
  if (choice === "day") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 3.5v2.2M12 18.3v2.2M4.8 4.8l1.6 1.6M17.6 17.6l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.8 19.2l1.6-1.6M17.6 6.4l1.6-1.6" />
      </svg>
    );
  }
  if (choice === "night") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M15.5 3.5a8.2 8.2 0 1 0 5 12.6A8.5 8.5 0 0 1 15.5 3.5Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="5" width="16" height="11" rx="1.5" />
      <path d="M9 19.5h6M12 16v3.5" />
    </svg>
  );
}
