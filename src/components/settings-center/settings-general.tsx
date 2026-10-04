"use client";

import { useEffect, useState } from "react";
import { PushAlertsRows } from "@/components/settings-center/push-alerts-rows";
import { ScGroup, ScReadonlySwitch, ScRow, ScStatus } from "@/components/settings-center/settings-primitives";
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
        <ScRow label="Language" stack>
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
          {smsOptedOut ? (
            <ScStatus on={false}>{textLabel}</ScStatus>
          ) : (
            <ScReadonlySwitch on={smsOn} label="Text alerts" />
          )}
        </ScRow>
        <ScRow label="Email backup" hint="Backup alerts go to your sign-in email when a text cannot be delivered.">
          <ScReadonlySwitch on={emailOn} label="Email backup" />
        </ScRow>
      </ScGroup>
    </>
  );
}

function ThemeMark({ choice }: { choice: ThemeChoice }) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (choice === "day") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="3.6" {...stroke} />
        <path d="M12 3v1.8M12 19.2V21M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M3 12h1.8M19.2 12H21M5.6 18.4l1.3-1.3M17.1 6.9l1.3-1.3" {...stroke} />
      </svg>
    );
  }
  if (choice === "night") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M19.5 14.6A7.8 7.8 0 0 1 9.4 4.5a7.8 7.8 0 1 0 10.1 10.1Z" {...stroke} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="8" {...stroke} />
      <path d="M12 7a5 5 0 0 1 0 10Z" fill="currentColor" />
    </svg>
  );
}
