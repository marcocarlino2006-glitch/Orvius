"use client";

import { useEffect } from "react";
import { translations, type Lang } from "@/lib/i18n";

/**
 * Applies translations to [data-i18n] nodes based on the active language.
 * Server components render English + a data-i18n key; this swaps text on load
 * and whenever the language changes (via the "orvius-lang" event).
 */
export function I18nRuntime() {
  useEffect(() => {
    function apply(lang: Lang) {
      document.documentElement.setAttribute("data-lang", lang);
      document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
        const key = el.getAttribute("data-i18n");
        if (!key) return;
        const dict = translations[key];
        if (dict) el.textContent = dict[lang] ?? dict.en;
      });
    }

    let lang: Lang = "en";
    try {
      lang = (window.localStorage.getItem("orvius-lang") as Lang) || "en";
    } catch {
      /* ignore */
    }
    apply(lang);

    function onLang(e: Event) {
      apply(((e as CustomEvent).detail as Lang) || "en");
    }
    window.addEventListener("orvius-lang", onLang);
    return () => window.removeEventListener("orvius-lang", onLang);
  }, []);

  return null;
}
