"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

type ProfileMenuProps = {
  businessName?: string;
  statusLabel?: string;
};

const links = [
  { href: "/dashboard", label: "Overview", hint: "OS hub · stats" },
  { href: "/dashboard/inbox", label: "Inbox", hint: "Leads · Ring 1" },
  { href: "/dashboard/customers", label: "Customers", hint: "Records · Ring 2" },
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
          className="mb-3 w-[min(20rem,calc(100vw-2.5rem))] overflow-hidden rounded-xl border border-rule bg-chalk shadow-[0_24px_60px_rgba(10,11,10,0.22)]"
          role="menu"
          data-orvius-profile-menu="true"
        >
          <div className="border-b border-rule px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-void font-sans text-sm font-semibold text-chalk">
                O
              </div>
              <div className="min-w-0">
                <p className="truncate font-sans text-sm font-semibold text-void">
                  {businessName}
                </p>
                <p className="truncate font-sans text-xs text-ash">
                  {statusLabel}
                </p>
              </div>
            </div>
          </div>

          <div className="py-1.5">
            {links.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-start justify-between gap-3 px-4 py-2.5 transition hover:bg-fog"
              >
                <span className="font-sans text-sm font-medium text-void">
                  {item.label}
                </span>
                <span className="text-right font-sans text-xs text-ash">
                  {item.hint}
                </span>
              </Link>
            ))}
          </div>

          <div className="border-t border-rule px-2 py-2">
            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-2.5 font-sans text-sm font-medium text-void transition hover:bg-fog"
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
        className="group flex items-center gap-3 rounded-full border border-rule bg-chalk py-2 pl-2 pr-4 shadow-[0_10px_30px_rgba(10,11,10,0.14)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(10,11,10,0.18)]"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-void font-sans text-sm font-semibold text-chalk transition group-hover:bg-flare">
          O
        </span>
        <span className="hidden text-left sm:block">
          <span className="block font-sans text-sm font-medium leading-none text-void">
            Orvius
          </span>
          <span className="mt-1 block font-sans text-[11px] leading-none text-ash">
            Menu
          </span>
        </span>
      </button>
    </div>
  );
}
