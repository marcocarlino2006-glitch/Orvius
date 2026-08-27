"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

type ProfileMenuProps = {
  businessName?: string;
  statusLabel?: string;
};

const links = [
  { href: "/dashboard", label: "Dashboard", hint: "Calls, leads, waitlist" },
  { href: "/admin", label: "Business setup", hint: "Receptionist & config" },
  { href: "/demo", label: "Demo call", hint: "Sales walkthrough" },
  { href: "/pilot", label: "Pilot applications", hint: "Design partner form" },
  { href: "/domains", label: "Domain", hint: "orvius.im DNS" },
];

export function ProfileMenu({
  businessName = "Orvius",
  statusLabel = "Founder workspace",
}: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    // Defer so the opening click doesn't immediately close
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown);
    }, 0);

    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="fixed bottom-5 left-5 z-[100] md:bottom-6 md:left-6"
      data-orvius-profile="true"
    >
      {open ? (
        <div
          id={menuId}
          className="profile-popup mb-3 w-[min(20rem,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_20px_50px_rgba(14,16,19,0.18)]"
          role="menu"
          data-orvius-profile-menu="true"
        >
          <div className="border-b border-line px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink font-sans text-sm font-semibold text-paper">
                O
              </div>
              <div className="min-w-0">
                <p className="truncate font-sans text-base font-medium text-ink">
                  {businessName}
                </p>
                <p className="truncate text-xs text-muted">{statusLabel}</p>
              </div>
            </div>
          </div>

          <div className="py-2">
            {links.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-start justify-between gap-3 px-4 py-2.5 transition hover:bg-surface"
              >
                <span className="font-sans text-sm font-medium text-ink">
                  {item.label}
                </span>
                <span className="text-right text-xs text-muted">{item.hint}</span>
              </Link>
            ))}
          </div>

          <div className="border-t border-line px-2 py-2">
            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2.5 font-sans text-sm font-medium text-ink transition hover:bg-surface"
            >
              Marketing site
            </Link>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        data-orvius-profile-button="true"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="group flex items-center gap-3 rounded-full border border-line bg-paper py-2 pl-2 pr-4 shadow-[0_10px_30px_rgba(14,16,19,0.12)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(14,16,19,0.16)]"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink font-sans text-sm font-semibold text-paper transition group-hover:bg-accent">
          O
        </span>
        <span className="hidden text-left sm:block">
          <span className="block font-sans text-sm font-medium leading-none text-ink">
            Orvius
          </span>
          <span className="mt-1 block text-[11px] leading-none text-muted">
            Menu
          </span>
        </span>
      </button>
    </div>
  );
}
