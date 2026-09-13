"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { OsIcon, type OsIconName } from "@/components/os-icons";
import { osProductNav, osWorkspaceNav } from "@/lib/os-nav";
import { copyWeeklyProofRitual } from "@/lib/weekly-proof-client";
import type { SearchHit } from "@/app/api/search/route";

type PaletteItem = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon?: OsIconName;
  run: () => void | Promise<void>;
};

const KIND_LABEL: Record<SearchHit["kind"], string> = {
  lead: "Caller",
  customer: "Customer",
  job: "Job",
};

/**
 * One box over the whole shop: jump to any screen, find any caller, customer,
 * or job, and run the two rituals owners repeat. Opens with Cmd/Ctrl + K.
 */
export function OsCommandPalette({
  open,
  onClose,
  shopLine,
}: {
  open: boolean;
  onClose: () => void;
  shopLine?: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
      setActive(0);
      setNote(null);
      // Hand focus back to whatever opened the palette.
      restoreFocusTo.current?.focus();
      restoreFocusTo.current = null;
      return;
    }
    const opener = document.activeElement;
    restoreFocusTo.current = opener instanceof HTMLElement ? opener : null;
    inputRef.current?.focus();
  }, [open]);

  // Debounced record search — only once the query can actually match.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { hits: SearchHit[] };
        setHits(data.hits ?? []);
      } catch {
        /* keep last results */
      } finally {
        setSearching(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query, open]);

  const go = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();

    const screens: PaletteItem[] = [...osProductNav, ...osWorkspaceNav].map((nav) => ({
      id: `nav:${nav.href}`,
      label: nav.label,
      hint: "Screen",
      group: "Go to",
      icon: nav.icon,
      run: () => go(nav.href),
    }));

    const records: PaletteItem[] = hits.map((hit) => ({
      id: `${hit.kind}:${hit.id}`,
      label: hit.title,
      hint: hit.detail || KIND_LABEL[hit.kind],
      group: KIND_LABEL[hit.kind],
      run: () => go(hit.href),
    }));

    const actions: PaletteItem[] = [
      ...(shopLine
        ? [
            {
              id: "action:copy-line",
              label: "Copy shop line",
              hint: shopLine,
              group: "Do",
              run: async () => {
                try {
                  await navigator.clipboard.writeText(shopLine);
                  setNote(`${shopLine} copied to your clipboard.`);
                } catch {
                  setNote("Could not copy the number.");
                }
              },
            } satisfies PaletteItem,
          ]
        : []),
      {
        id: "action:proof",
        label: "Copy weekly proof",
        hint: "Recovered jobs and dollars",
        group: "Do",
        run: async () => {
          try {
            await copyWeeklyProofRitual();
            setNote("Weekly proof copied to your clipboard.");
          } catch {
            setNote("Could not copy the proof — try the Command board.");
          }
        },
      },
      {
        id: "action:test-alert",
        label: "Send test alert",
        hint: "Check your phone gets it",
        group: "Do",
        run: async () => {
          try {
            const res = await fetch("/api/account/test-alert", { method: "POST" });
            const data = (await res.json().catch(() => null)) as {
              ok?: boolean;
              error?: string;
            } | null;
            setNote(
              data?.error ??
                (data?.ok
                  ? "Test alert sent — check your phone."
                  : "Alert queued but not delivered. Check Settings."),
            );
          } catch {
            setNote("Could not send the test alert.");
          }
        },
      },
    ];

    const matches = (item: PaletteItem) =>
      !q ||
      item.label.toLowerCase().includes(q) ||
      (item.hint?.toLowerCase().includes(q) ?? false);

    return [...records, ...screens.filter(matches), ...actions.filter(matches)];
  }, [hits, query, go, shopLine]);

  useEffect(() => {
    setActive(0);
  }, [query, hits.length]);

  useEffect(() => {
    if (!open) return;
    document
      .getElementById(`os-palette-option-${active}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  if (!open) return null;

  const groups: Array<{ group: string; items: PaletteItem[] }> = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.group === item.group) last.items.push(item);
    else groups.push({ group: item.group, items: [item] });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    // The palette is modal: Tab must not walk into the page behind it.
    if (event.key === "Tab") {
      event.preventDefault();
      inputRef.current?.focus();
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActive(Math.max(0, items.length - 1));
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (items.length ? (i + 1) % items.length : 0));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      void items[active]?.run();
    }
  }

  let index = -1;

  return (
    <div className="os-palette-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="os-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search and jump"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="os-palette-field">
          <input
            ref={inputRef}
            className="os-palette-input font-sans"
            placeholder="Search callers, customers, jobs — or jump to a screen"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded
            aria-controls="os-palette-list"
            aria-autocomplete="list"
            aria-activedescendant={
              items.length ? `os-palette-option-${active}` : undefined
            }
          />
          <kbd className="os-palette-kbd">Esc</kbd>
        </div>

        <div
          className="os-palette-list"
          role="listbox"
          id="os-palette-list"
          aria-label="Results"
        >
          {groups.map((group) => (
            <div
              className="os-palette-group"
              key={group.group}
              role="group"
              aria-label={group.group}
            >
              <p className="os-palette-group-label font-sans" aria-hidden>
                {group.group}
              </p>
              {group.items.map((item) => {
                index += 1;
                const isActive = index === active;
                return (
                  <button
                    key={item.id}
                    id={`os-palette-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    tabIndex={-1}
                    className={`os-palette-row font-sans ${
                      isActive ? "os-palette-row-active" : ""
                    }`}
                    onMouseEnter={() => setActive(items.indexOf(item))}
                    onClick={() => void item.run()}
                  >
                    {item.icon ? <OsIcon name={item.icon} /> : null}
                    <span className="os-palette-row-label">{item.label}</span>
                    {item.hint ? (
                      <span className="os-palette-row-hint">{item.hint}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}

          {!items.length ? (
            <p className="os-palette-empty font-sans">
              {searching ? "Searching the shop record…" : "Nothing matches that yet."}
            </p>
          ) : null}
        </div>

        <p className="os-palette-note font-sans" role="status" aria-live="polite">
          {note}
        </p>
      </div>
    </div>
  );
}
