"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SHORTCUT_GROUPS, SHOW_SHORTCUTS_EVENT, goToHref, isTypingTarget } from "@/lib/keyboard-shortcuts";

const SEQUENCE_MS = 1200;

export function KeyboardShortcuts() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const pendingG = useRef<number>(0);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }
      if (Date.now() - pendingG.current < SEQUENCE_MS) {
        pendingG.current = 0;
        const href = goToHref(event.key);
        if (href) {
          event.preventDefault();
          setOpen(false);
          router.push(href);
        }
        return;
      }
      if (event.key.toLowerCase() === "g") pendingG.current = Date.now();
    }
    const show = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(SHOW_SHORTCUTS_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(SHOW_SHORTCUTS_EVENT, show);
    };
  }, [router]);

  if (!open) return null;
  return (
    <div className="os-palette-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <div
        className="os-palette os-shortcuts"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="os-shortcuts-head">
          <p className="os-shortcuts-title font-sans">Keyboard shortcuts</p>
          <button type="button" className="os-palette-kbd" onClick={() => setOpen(false)} aria-label="Close">
            Esc
          </button>
        </div>
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title} className="os-shortcuts-group">
            <p className="os-palette-group-label font-sans">{group.title}</p>
            <ul className="os-shortcuts-list">
              {group.items.map((item) => (
                <li key={item.label} className="os-shortcuts-row font-sans">
                  <span>{item.label}</span>
                  <span className="os-shortcuts-keys">
                    {item.keys.map((key) => (
                      <kbd key={key} className="os-palette-kbd">
                        {key}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
