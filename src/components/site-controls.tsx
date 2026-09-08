"use client";

import { useEffect, useRef, useState } from "react";
import { LANGS } from "@/lib/i18n";

/**
 * Bottom-left site controls (cursor.com style): light/dark theme segmented
 * control + a language selector.
 */
export function SiteControls() {
  const [theme, setTheme] = useState<"day" | "night">("day");
  const [lang, setLang] = useState("en");
  const [langOpen, setLangOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTheme(
      document.documentElement.getAttribute("data-theme") === "night"
        ? "night"
        : "day",
    );
    try {
      const l = window.localStorage.getItem("orvius-lang");
      if (l) setLang(l);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (langOpen && ref.current && !ref.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [langOpen]);

  function applyTheme(next: "day" | "night") {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem("orvius-theme", next);
    } catch {
      /* ignore */
    }
  }

  function pickLang(code: string) {
    setLang(code);
    setLangOpen(false);
    try {
      window.localStorage.setItem("orvius-lang", code);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent("orvius-lang", { detail: code }));
  }

  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];

  return (
    <div className="site-controls" ref={ref}>
      <div className="site-controls-theme" role="group" aria-label="Theme">
        <button
          type="button"
          className={theme === "day" ? "is-active" : ""}
          aria-pressed={theme === "day"}
          aria-label="Light mode"
          onClick={() => applyTheme("day")}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        </button>
        <button
          type="button"
          className={theme === "night" ? "is-active" : ""}
          aria-pressed={theme === "night"}
          aria-label="Dark mode"
          onClick={() => applyTheme("night")}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </button>
      </div>

      <div className="site-controls-lang">
        <button
          type="button"
          className="site-controls-lang-btn"
          aria-haspopup="listbox"
          aria-expanded={langOpen}
          onClick={() => setLangOpen((o) => !o)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20" />
          </svg>
          <span>{current.label}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {langOpen ? (
          <ul className="site-controls-lang-menu" role="listbox">
            {LANGS.map((l) => (
              <li key={l.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={l.code === lang}
                  className={l.code === lang ? "is-active" : ""}
                  onClick={() => pickLang(l.code)}
                >
                  {l.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
