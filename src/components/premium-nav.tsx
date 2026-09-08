"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { OrviusLogo } from "@/components/orvius-logo";

const NAV = [
  { href: "/product", label: "Product" },
  { href: "/enterprise", label: "Enterprise" },
  { href: "/pricing", label: "Pricing" },
  { href: "/resources", label: "Resources" },
] as const;

/**
 * Company chrome — Grok-grade restraint on a night-shift field.
 * Circular menu control. Full-bleed void drawer. No cream SaaS sheet.
 */
export function PremiumNav() {
  const menuId = useId();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [night, setNight] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 12);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setNight(document.documentElement.getAttribute("data-theme") === "night");
  }, []);

  function toggleTheme() {
    const next = !night;
    setNight(next);
    document.documentElement.setAttribute("data-theme", next ? "night" : "day");
    try {
      window.localStorage.setItem("orvius-theme", next ? "night" : "day");
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <>
      <header
        className={`mkt-nav mkt-nav--institution ${scrolled ? "mkt-nav--elevated" : ""} ${menuOpen ? "mkt-nav--open" : ""}`}
      >
        <div className="mkt-nav-inner">
          <Link
            href="/"
            className="mkt-nav-brand"
            onClick={() => setMenuOpen(false)}
          >
            <OrviusLogo variant="void" size="lg" />
          </Link>

          <nav className="mkt-nav-links" aria-label="Main">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mkt-nav-actions">
            <button
              type="button"
              className="mkt-nav-theme"
              onClick={toggleTheme}
              aria-label={night ? "Switch to day mode" : "Switch to night mode"}
              title={night ? "Day mode" : "Night mode"}
            >
              {night ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
            <Link href="/login" className="mkt-nav-login">
              Sign in
            </Link>
            <Link href="/demo" className="mkt-btn mkt-nav-secondary">
              Book a demo
            </Link>
            <Link href="/pilot" className="mkt-btn mkt-nav-cta">
              Prove it
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
        <div id={menuId} className="mkt-nav-sheet" role="dialog" aria-modal="true">
          <div className="mkt-nav-sheet-bar">
            <Link
              href="/"
              className="mkt-nav-brand"
              onClick={() => setMenuOpen(false)}
            >
              <OrviusLogo variant="void" size="lg" />
            </Link>
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
            <Link href="/login" onClick={() => setMenuOpen(false)}>
              Sign in
            </Link>
          </nav>

          <div className="mkt-nav-sheet-foot">
            <Link
              href="/pilot"
              className="mkt-nav-sheet-cta"
              onClick={() => setMenuOpen(false)}
            >
              Prove it on your line
            </Link>
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
