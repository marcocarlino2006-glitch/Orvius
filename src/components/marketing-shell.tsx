import { ProfileMenu } from "@/components/profile-menu";
import { ShellHeader } from "@/components/shell-header";
import { SiteFooter } from "@/components/site-footer";

type MarketingShellProps = {
  children: React.ReactNode;
  statusLabel?: string;
  headerPosition?: "absolute" | "sticky";
  showFooter?: boolean;
  cta?: { href: string; label: string } | false;
};

export function MarketingShell({
  children,
  statusLabel = "Founder workspace",
  headerPosition = "absolute",
  showFooter = true,
  cta,
}: MarketingShellProps) {
  return (
    <>
      <ShellHeader plane="void" position={headerPosition} cta={cta} />
      <div className="min-h-screen bg-void text-chalk">{children}</div>
      {showFooter ? <SiteFooter /> : null}
      <ProfileMenu statusLabel={statusLabel} />
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
    <div className={`max-w-2xl ${className}`}>
      <p className="eyebrow">{label}</p>
      <h1 className="mt-4 font-serif text-4xl leading-[1.08] tracking-[-0.04em] text-chalk md:text-5xl">
        {title}
      </h1>
      {description ? (
        <p className="mt-5 font-sans text-lg leading-relaxed text-ash-soft md:text-xl">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function ShellVoidPanel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`panel-void shadow-[0_0_0_1px_rgba(232,70,28,0.08)] ${className}`}
    >
      {children}
    </div>
  );
}
