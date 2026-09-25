"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  isSettingsSection,
  SETTINGS_EVENT,
  SETTINGS_PARAM,
  settingsSectionForHref,
  type SettingsSectionId,
} from "@/lib/settings-center";

const SettingsCenter = dynamic(() => import("./settings-center").then((m) => m.SettingsCenter), {
  ssr: false,
});

function writeParam(section: SettingsSectionId | null) {
  const url = new URL(window.location.href);
  if (section) url.searchParams.set(SETTINGS_PARAM, section);
  else url.searchParams.delete(SETTINGS_PARAM);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

/**
 * Settings open as a panel over whatever page the owner is on. Any in-app link
 * to /dashboard/settings or /dashboard/profile opens it instead of navigating.
 */
export function SettingsCenterHost() {
  const [section, setSection] = useState<SettingsSectionId | null>(null);
  const pathname = usePathname();

  const open = useCallback((next: SettingsSectionId) => {
    setSection(next);
    writeParam(next);
  }, []);

  const close = useCallback(() => {
    setSection(null);
    writeParam(null);
  }, []);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get(SETTINGS_PARAM);
    if (isSettingsSection(fromUrl)) setSection(fromUrl);
  }, [pathname]);

  useEffect(() => {
    function onOpen(event: Event) {
      const detail = (event as CustomEvent<SettingsSectionId>).detail;
      open(isSettingsSection(detail) ? detail : "account");
    }

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      const next = settingsSectionForHref(anchor.getAttribute("href") ?? "");
      if (!next) return;
      event.preventDefault();
      open(next);
    }

    window.addEventListener(SETTINGS_EVENT, onOpen);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, onOpen);
      document.removeEventListener("click", onClick, true);
    };
  }, [open]);

  if (!section) return null;
  return <SettingsCenter section={section} onSection={open} onClose={close} />;
}
