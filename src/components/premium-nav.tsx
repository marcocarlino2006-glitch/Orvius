"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { OrviusLogo } from "@/components/orvius-logo";
import "./premium-nav.css";

type MenuItem = { href: string; label: string; detail: string; i18n?: string };
type MenuId = "product" | "resources";

const MENUS: Record<MenuId, { items: MenuItem[]; feature: { title: string; body: string; href: string; cta: string; art: string } }> = {
  product: {
    items: [
      { href: "/product", label: "Receptionist", detail: "Answers in your name, offers a time, texts you what happened." },
      { href: "/#command", label: "Command board", detail: "The morning list, sorted by what's at stake." },
      { href: "/#calls", label: "Calls and inbox", detail: "Every call recorded, summarized and graded." },
      { href: "/#field", label: "Confirm and dispatch", detail: "One tap for the customer, one page for your team." },
      { href: "/#industries", label: "Industries", detail: "Field trades, offices, salons, clinics and more." },
      { href: "/enterprise", label: "Multi-location", detail: "Many lines, one board, roles for every seat." },
    ],
    feature: {
      title: "Hear it answer",
      body: "Call the live line and talk to the same receptionist your callers get.",
      href: "tel:+18446439170",
      cta: "+1 844 643 9170",
      art: "/marketing/art/dusk.webp",
    },
  },
  resources: {
    items: [
      { href: "/help", label: "Help center", detail: "Setup, settings and answers." },
      { href: "/pilot", label: "Call audit", detail: "See what your missed calls are worth.", i18n: "nav.audit" },
      { href: "/changelog", label: "Changelog", detail: "What shipped, every week." },
      { href: "/security", label: "Security", detail: "How call data is stored and protected." },
      { href: "/about", label: "About", detail: "The mission and the team." },
      { href: "/status", label: "Status", detail: "Live line and system health." },
    ],
    feature: {
      title: "Free call audit",
      body: "We review a week of your calls and show what went unanswered.",
      href: "/pilot",
      cta: "Start an audit",
      art: "/marketing/art/night.webp",
    },
  },
};

const NAV: { href: string; label: string; i18n: string; menu?: MenuId }[] = [
  { href: "/product", label: "Product", i18n: "nav.product", menu: "product" },
  { href: "/enterprise", label: "Enterprise", i18n: "nav.enterprise" },
  { href: "/pricing", label: "Pricing", i18n: "nav.pricing" },
  { href: "/resources", label: "Resources", i18n: "nav.resources", menu: "resources" },
];

function Caret() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mkt-nav-caret">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** Compact company chrome with one primary action and an accessible mobile sheet. */
export function PremiumNav() {
  const menuId = useId();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const hoverTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!openMenu) return;
    function onDown(event: PointerEvent) {
      if (!navRef.current?.contains(event.target as Node)) setOpenMenu(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenMenu(null);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  const hoverOpen = (id: MenuId | null) => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setOpenMenu(id), id ? 60 : 160);
  };

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 12);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const restoreFocus = document.activeElement as HTMLElement | null;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>("button, a[href]")?.focus();
    });
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      restoreFocus?.focus();
    };
  }, [menuOpen]);

  return (
    <>
      <header
        className={`mkt-nav mkt-nav--institution ${scrolled ? "mkt-nav--elevated" : ""} ${menuOpen ? "mkt-nav--open" : ""}`}
      >
        <div className="mkt-nav-inner">
          <div className="mkt-nav-brandline">
            <Link
              href="/"
              className="mkt-nav-brand"
              onClick={() => setMenuOpen(false)}
            >
              <OrviusLogo variant="void" size="lg" />
            </Link>
          </div>

          <nav
            ref={navRef}
            className="mkt-nav-links"
            aria-label="Main"
            onPointerLeave={(e) => e.pointerType === "mouse" && hoverOpen(null)}
          >
            {NAV.map((item) => {
              if (!item.menu) {
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-i18n={item.i18n}
                    onPointerEnter={(e) => e.pointerType === "mouse" && hoverOpen(null)}
                  >
                    {item.label}
                  </Link>
                );
              }
              const id = item.menu;
              const menu = MENUS[id];
              const open = openMenu === id;
              return (
                <div key={item.href} className="mkt-nav-item" onPointerEnter={(e) => e.pointerType === "mouse" && hoverOpen(id)}>
                  <button
                    type="button"
                    className={`mkt-nav-trigger ${open ? "is-open" : ""}`}
                    aria-expanded={open}
                    aria-controls={`${menuId}-${id}`}
                    data-i18n={item.i18n}
                    onClick={() => setOpenMenu(open ? null : id)}
                  >
                    {item.label}
                    <Caret />
                  </button>
                  <div id={`${menuId}-${id}`} className={`mkt-nav-panel ${open ? "is-open" : ""}`} hidden={!open}>
                    <ul className="mkt-nav-panel-list">
                      {menu.items.map((m) => (
                        <li key={m.href}>
                          <Link href={m.href} onClick={() => setOpenMenu(null)}>
                            <span className="mkt-nav-panel-label" data-i18n={m.i18n}>{m.label}</span>
                            <span className="mkt-nav-panel-detail">{m.detail}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <a href={menu.feature.href} className="mkt-nav-panel-feature" onClick={() => setOpenMenu(null)}>
                      <span className="mkt-nav-panel-feature-art" style={{ backgroundImage: `url(${menu.feature.art})` }} aria-hidden />
                      <span className="mkt-nav-panel-label">{menu.feature.title}</span>
                      <span className="mkt-nav-panel-detail">{menu.feature.body}</span>
                      <span className="mkt-nav-panel-cta">{menu.feature.cta} →</span>
                    </a>
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="mkt-nav-actions">
            <Link href="/signin" className="mkt-nav-login" data-i18n="nav.signin">
              Sign in
            </Link>
            <a href="mailto:hello@orvius.im" className="mkt-nav-login mkt-nav-contact" data-i18n="nav.contact">
              Talk to us
            </a>
            <a
              href="tel:+18446439170"
              className="ov-btn ov-btn--solid mkt-nav-cta"
              data-i18n="nav.proveit"
            >
              Call the live line
            </a>
            <button
              type="button"
              className="mkt-nav-menu-toggle"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span
                className={`mkt-nav-menu-icon ${menuOpen ? "mkt-nav-menu-icon--open" : ""}`}
                aria-hidden
              >
                <span />
                <span />
              </span>
            </button>
          </div>
        </div>
      </header>

      {menuOpen ? (
        <div
          id={menuId}
          ref={menuRef}
          className="mkt-nav-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div className="mkt-nav-sheet-bar">
            <div className="mkt-nav-brandline">
              <Link
                href="/"
                className="mkt-nav-brand"
                onClick={() => setMenuOpen(false)}
              >
                <OrviusLogo variant="void" size="lg" />
              </Link>
            </div>
            <button
              type="button"
              className="mkt-nav-menu-toggle mkt-nav-menu-toggle--close"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            >
              <span className="mkt-nav-menu-icon mkt-nav-menu-icon--open" aria-hidden>
                <span />
                <span />
              </span>
            </button>
          </div>

          <nav className="mkt-nav-sheet-nav" aria-label="Mobile">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link href="/pilot" onClick={() => setMenuOpen(false)}>
              Call audit
            </Link>
            <Link href="/help" onClick={() => setMenuOpen(false)}>
              Help center
            </Link>
            <Link href="/signin" onClick={() => setMenuOpen(false)}>
              Sign in
            </Link>
            <a href="tel:+18446439170" onClick={() => setMenuOpen(false)}>
              Call the live line
            </a>
          </nav>

          <div className="mkt-nav-sheet-foot">
            <a
              href="tel:+18446439170"
              className="mkt-nav-sheet-cta"
              onClick={() => setMenuOpen(false)}
            >
              Call the live line
            </a>
            <p className="mkt-nav-sheet-meta font-sans">
              <Link href="/legal" onClick={() => setMenuOpen(false)}>
                Legal
              </Link>
              <span aria-hidden>·</span>
              <Link href="/security" onClick={() => setMenuOpen(false)}>
                Security
              </Link>
              <span aria-hidden>·</span>
              <a href="mailto:hello@orvius.im">Contact</a>
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
