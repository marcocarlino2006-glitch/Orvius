"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useId, useState } from "react";
import { OrviusLogo } from "@/components/orvius-logo";

type NavLink = { href: string; label: string };

type ShellHeaderProps = {
  plane?: "void" | "chalk";
  position?: "absolute" | "sticky" | "fixed";
  surface?: "solid" | "glass";
  cta?: { href: string; label: string } | false;
  nav?: NavLink[] | false;
};

function HeaderCtaLink({
  href,
  label,
  className,
  onClick,
}: {
  href: string;
  label: string;
  className: string;
  onClick?: () => void;
}) {
  if (href.startsWith("tel:") || href.startsWith("mailto:")) {
    return (
      <a href={href} className={className} onClick={onClick}>
        {label}
      </a>
    );
  }

  return (
    <Link href={href} className={className} onClick={onClick}>
      {label}
    </Link>
  );
}

const defaultNav: NavLink[] = [
  { href: "/demo", label: "Demo" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "Company" },
];

export function ShellHeader({
  plane = "void",
  position = "sticky",
  surface = "solid",
  cta = { href: "/pilot", label: "Get started" },
  nav = defaultNav,
}: ShellHeaderProps) {
  const { data: session } = useSession();
  const isVoid = plane === "void";
  const isGlass = surface === "glass" && isVoid;
  const menuId = useId();

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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

  const elevated = isGlass ? scrolled : true;
  const positionClass = isGlass || position === "fixed"
    ? "fixed inset-x-0 top-0"
    : position === "absolute"
      ? "absolute inset-x-0 top-0"
      : "sticky top-0";

  const shellClass = [
    "shell-header",
    positionClass,
    isVoid ? "shell-header-void" : "shell-header-chalk",
    isGlass ? "shell-header-glass" : "",
    elevated ? "shell-header-elevated" : "",
    menuOpen ? "shell-header-menu-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const linkClass = isVoid
    ? "shell-nav-link shell-nav-link-void"
    : "shell-nav-link shell-nav-link-chalk";

  const signedIn = Boolean(session?.user);
  const headerCta = signedIn
    ? { href: "/dashboard", label: "Dashboard" }
    : cta;
  const signInHref = "/login";

  return (
    <>
      <header className={shellClass}>
        <div className="shell-header-bar mx-auto flex max-w-[80rem] items-center justify-between gap-6 px-6 md:px-8">
          <Link
            href="/"
            className={`shell-brand ${isVoid ? "text-chalk" : "text-void"}`}
            onClick={() => setMenuOpen(false)}
          >
            <OrviusLogo
              size="lg"
              variant={isVoid ? "void" : "chalk"}
            />
          </Link>

          {nav ? (
            <nav
              className="hidden items-center gap-1 md:flex"
              aria-label="Primary"
            >
              {nav.map((item) => (
                <Link key={item.href} href={item.href} className={linkClass}>
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : null}

          <div className="flex items-center gap-3 md:gap-4">
            {!signedIn ? (
              <Link href={signInHref} className={`${linkClass} hidden sm:inline-flex`}>
                Sign in
              </Link>
            ) : null}

            {headerCta ? (
              <HeaderCtaLink
                href={headerCta.href}
                label={headerCta.label}
                className={`${
                  headerCta.href.startsWith("tel:")
                    ? "inst-btn inst-btn-primary inst-btn-sm"
                    : isVoid
                      ? "inst-btn inst-btn-outline-light inst-btn-sm"
                      : "inst-btn inst-btn-primary inst-btn-sm"
                } shell-header-cta`}
              />
            ) : null}

            {nav ? (
              <button
                type="button"
                className={`shell-menu-toggle md:hidden ${isVoid ? "shell-menu-toggle-void" : "shell-menu-toggle-chalk"}`}
                aria-expanded={menuOpen}
                aria-controls={menuId}
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span className="sr-only">
                  {menuOpen ? "Close menu" : "Open menu"}
                </span>
                <span
                  className={`shell-menu-icon ${menuOpen ? "shell-menu-icon-open" : ""}`}
                  aria-hidden
                >
                  <span />
                  <span />
                </span>
              </button>
            ) : null}
          </div>
        </div>

        {nav && menuOpen ? (
          <div
            id={menuId}
            className={`shell-mobile-nav border-t md:hidden ${
              isVoid ? "border-white/8" : "border-rule"
            }`}
          >
            <nav className="mx-auto max-w-6xl px-6 py-4" aria-label="Mobile">
              <ul className="space-y-1">
                {nav.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`shell-mobile-link ${
                        isVoid ? "shell-mobile-link-void" : "shell-mobile-link-chalk"
                      }`}
                      onClick={() => setMenuOpen(false)}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
              {!signedIn ? (
                <Link
                  href={signInHref}
                  className={`shell-mobile-link mt-4 block ${
                    isVoid ? "shell-mobile-link-void" : "shell-mobile-link-chalk"
                  }`}
                  onClick={() => setMenuOpen(false)}
                >
                  Sign in
                </Link>
              ) : null}
              {headerCta ? (
                <HeaderCtaLink
                  href={headerCta.href}
                  label={headerCta.label}
                  className={`inst-btn mt-4 w-full justify-center ${
                    headerCta.href.startsWith("tel:")
                      ? "inst-btn-primary"
                      : "inst-btn-primary"
                  }`}
                  onClick={() => setMenuOpen(false)}
                />
              ) : null}
            </nav>
          </div>
        ) : null}
      </header>

      {menuOpen ? (
        <button
          type="button"
          className="shell-header-backdrop fixed inset-0 z-30 md:hidden"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
    </>
  );
}
