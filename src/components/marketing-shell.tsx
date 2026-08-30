import { ShellHeader } from "@/components/shell-header";
import { SiteFooter } from "@/components/site-footer";

type MarketingShellProps = {
  children: React.ReactNode;
  showFooter?: boolean;
  cta?: { href: string; label: string } | false;
};

export function MarketingShell({
  children,
  showFooter = true,
  cta = { href: "/login", label: "Sign in" },
}: MarketingShellProps) {
  return (
    <>
      <ShellHeader plane="chalk" position="sticky" cta={cta} />
      <div className="editorial min-h-screen bg-chalk text-void">{children}</div>
      {showFooter ? <SiteFooter /> : null}
    </>
  );
}

export function ShellPageIntro({
  label,
  title,
  description,
  className = "",
}: {
  label: string;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="home-os-kicker">{label}</p>
      <h1 className="mt-4 font-serif text-4xl leading-[1.08] tracking-[-0.04em] text-void md:text-5xl">
        {title}
      </h1>
      {description ? (
        <p className="mt-5 max-w-2xl font-sans text-lg leading-relaxed text-ash md:text-xl">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function ShellChalkPanel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`panel-chalk ${className}`}>{children}</div>;
}

/** @deprecated Use ShellChalkPanel — kept for gradual migration */
export const ShellVoidPanel = ShellChalkPanel;
