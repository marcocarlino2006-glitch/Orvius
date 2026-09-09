"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { OrviusLogo } from "@/components/orvius-logo";
import { SystemStatusPill } from "@/components/system-status-pill";

const NAV = [
  { href: "/product", label: "Product", i18n: "nav.product" },
  { href: "/enterprise", label: "Enterprise", i18n: "nav.enterprise" },
  { href: "/pricing", label: "Pricing", i18n: "nav.pricing" },
  { href: "/resources", label: "Resources", i18n: "nav.resources" },
] as const;

/** Compact company chrome with one primary action and an accessible mobile sheet. */
export function PremiumNav() {
  const menuId = useId();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
            <SystemStatusPill className="ov-status-pill--nav" />
          </div>

          <nav className="mkt-nav-links" aria-label="Main">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} data-i18n={item.i18n}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mkt-nav-actions">
            <Link href="/signin" className="mkt-nav-login" data-i18n="nav.signin">
              Sign in
            </Link>
            <Link
              href="/pilot"
              className="mkt-btn mkt-nav-cta"
              data-i18n="nav.bookdemo"
            >
              Book an audit
            </Link>
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
              <SystemStatusPill />
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
            <Link href="/signin" onClick={() => setMenuOpen(false)}>
              Sign in
            </Link>
            <Link href="/pilot" onClick={() => setMenuOpen(false)}>
              Book a call audit
            </Link>
          </nav>

          <div className="mkt-nav-sheet-foot">
            <a
              href="tel:+18446439170"
              className="mkt-nav-sheet-cta"
              onClick={() => setMenuOpen(false)}
            >
              Call the live AI
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
