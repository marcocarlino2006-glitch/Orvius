import { BrandIntro } from "@/components/brand-intro";
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
  cta = { href: "/pilot", label: "Free pilot" },
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
  subline,
  description,
  className = "",
}: {
  label: string;
  title: string;
  subline?: string;
  description?: string;
  className?: string;
}) {
  return (
    <BrandIntro
      className={className}
      kicker={label}
      title={title}
      subline={subline}
      description={description}
      align="left"
    />
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
