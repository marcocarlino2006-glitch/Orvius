"use client";

import { useEffect, useRef, useState } from "react";
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

const THEMES: { choice: ThemeChoice; label: string; icon: React.ReactNode }[] = [
  { choice: "day", label: "Light", icon: <SunIcon /> },
  { choice: "night", label: "Dark", icon: <MoonIcon /> },
  { choice: "system", label: "System", icon: <MonitorIcon /> },
];

/**
 * Floating utility dock — language selector plus a three-state theme pill,
 * anchored bottom-right above every public surface.
 *
 * Both controls drive real state: the theme writes the resolved colorway onto
 * <html data-theme> and persists the choice, and the language broadcasts the
 * "orvius-lang" event that <I18nRuntime /> listens for.
 */
export function UtilityDock() {
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>("day");
  const [lang, setLang] = useState<Lang>("en");
  const [langOpen, setLangOpen] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);
  const langButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setThemeChoice(readThemeChoice());
    try {
      const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
      if (LANGS.some((entry) => entry.code === stored)) setLang(stored as Lang);
    } catch {
      /* storage blocked — English stands */
    }
  }, []);

  // In system mode the dock keeps following the OS after the initial resolve.
  useEffect(() => {
    if (themeChoice !== "system") return;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = () => applyResolvedTheme(resolveTheme("system"));
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [themeChoice]);

  useEffect(() => {
    if (!langOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!dockRef.current?.contains(event.target as Node)) setLangOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setLangOpen(false);
      langButtonRef.current?.focus();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [langOpen]);

  function pickTheme(choice: ThemeChoice) {
    setThemeChoice(choice);
    storeThemeChoice(choice);
    applyResolvedTheme(resolveTheme(choice));
  }

  function pickLang(code: Lang) {
    setLang(code);
    setLangOpen(false);
    langButtonRef.current?.focus();
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, code);
    } catch {
      /* storage blocked — the swap still applies for this session */
    }
    window.dispatchEvent(new CustomEvent("orvius-lang", { detail: code }));
  }

  const current = LANGS.find((entry) => entry.code === lang) ?? LANGS[0];

  return (
    <div className="fixed right-6 bottom-4 z-50 print:hidden">
      <div
        ref={dockRef}
        className="relative inline-flex items-center gap-2 rounded-full border border-ui-border bg-[var(--ui-dock-glass)] p-1.5 shadow-[var(--ui-dock-shadow)] backdrop-blur-md"
      >
        <button
          ref={langButtonRef}
          type="button"
          className="ui-pill inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-ui-muted transition-colors hover:bg-ui-surface-hover hover:text-ui-text focus-visible:ring-2 focus-visible:ring-ui-muted focus-visible:outline-none"
          aria-haspopup="listbox"
          aria-expanded={langOpen}
          aria-label={`Language: ${current.label}`}
          onClick={() => setLangOpen((open) => !open)}
        >
          <GlobeIcon />
          <span>{current.label}</span>
          <ChevronIcon />
        </button>

        <span className="h-4 w-px bg-ui-border" aria-hidden />

        <div className="inline-flex items-center gap-0.5" role="group" aria-label="Theme">
          {THEMES.map((entry) => {
            const active = entry.choice === themeChoice;
            return (
              <button
                key={entry.choice}
                type="button"
                className={[
                  "ui-pill p-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ui-muted focus-visible:outline-none",
                  active
                    ? "bg-ui-selected text-ui-on-selected"
                    : "text-ui-muted hover:text-ui-text",
                ].join(" ")}
                aria-pressed={active}
                aria-label={`${entry.label} theme`}
                title={`${entry.label} theme`}
                onClick={() => pickTheme(entry.choice)}
              >
                {entry.icon}
              </button>
            );
          })}
        </div>

        {langOpen ? (
          <ul
            className="absolute right-0 bottom-full mb-2 w-36 rounded-xl border border-ui-border bg-ui-surface p-1 shadow-[var(--ui-dock-shadow)]"
            role="listbox"
            aria-label="Language"
          >
            {LANGS.map((entry) => (
              <li key={entry.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={entry.code === lang}
                  className={[
                    "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors",
                    entry.code === lang
                      ? "bg-ui-selected text-ui-on-selected"
                      : "text-ui-muted hover:bg-ui-surface-hover hover:text-ui-text",
                  ].join(" ")}
                  onClick={() => pickLang(entry.code)}
                >
                  <span>{entry.label}</span>
                  {entry.code === lang ? <CheckIcon /> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/* Icons are inline strokes at the dock's own scale — no icon dependency. */

function GlobeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}
