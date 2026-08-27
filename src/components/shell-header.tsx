import Link from "next/link";

type ShellHeaderProps = {
  plane?: "void" | "chalk";
  position?: "absolute" | "sticky";
  cta?: { href: string; label: string } | false;
  secondaryHref?: { href: string; label: string };
};

export function ShellHeader({
  plane = "void",
  position = "absolute",
  cta = { href: "/pilot", label: "Start free pilot" },
  secondaryHref = { href: "/dashboard", label: "Product" },
}: ShellHeaderProps) {
  const isVoid = plane === "void";

  const positionClass =
    position === "absolute"
      ? "absolute inset-x-0 top-0"
      : "sticky top-0 border-b border-rule bg-chalk/92 backdrop-blur-md";

  const linkMuted = isVoid
    ? "text-ash-soft hover:text-chalk"
    : "text-ash hover:text-void";

  return (
    <header className={`${positionClass} z-40`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 md:px-8 md:py-6">
        <Link
          href="/"
          className={`font-sans text-sm font-semibold tracking-[0.22em] uppercase ${
            isVoid ? "text-chalk" : "text-void"
          }`}
        >
          Orvius
        </Link>

        <div className="flex items-center gap-5 md:gap-6">
          <Link
            href={secondaryHref.href}
            className={`hidden font-sans text-sm transition md:inline ${linkMuted}`}
          >
            {secondaryHref.label}
          </Link>
          {cta ? (
            <Link
              href={cta.href}
              className={isVoid ? "btn btn-on-void" : "btn btn-primary"}
            >
              {cta.label}
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
