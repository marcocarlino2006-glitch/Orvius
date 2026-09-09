import type { Metadata } from "next";
import {
  CardBody,
  CardTitle,
  LiveBadge,
  PillButton,
  PillLink,
  SurfaceCard,
} from "@/components/ui-kit";
import { UtilityDock } from "@/components/utility-dock";

export const metadata: Metadata = {
  title: "UI kit",
  robots: { index: false, follow: false },
};

const TOKENS = [
  { name: "--ui-bg", role: "Base canvas" },
  { name: "--ui-surface", role: "Card surface" },
  { name: "--ui-surface-hover", role: "Hover / highlight" },
  { name: "--ui-selected", role: "Selected chip" },
  { name: "--ui-cta", role: "Primary action" },
  { name: "--ui-text", role: "Text primary" },
  { name: "--ui-text-muted", role: "Text muted" },
  { name: "--ui-border", role: "Border" },
] as const;

/**
 * Internal reference surface. Every primitive is rendered twice — once pinned
 * to each colorway — so a token regression is visible instead of theoretical.
 * Not indexed and not linked from public navigation.
 */
export default function UiKitPage() {
  return (
    <main className="min-h-screen bg-ui-bg px-6 py-14 text-ui-text" data-theme="night">
      <div className="mx-auto flex max-w-5xl flex-col gap-12">
        <header className="flex flex-col gap-3">
          <LiveBadge label="Internal" />
          <h1 className="text-3xl font-semibold tracking-tight">Orvius UI kit</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-ui-muted">
            Two colorways over one token contract. Components below are written
            once against <code className="font-mono text-ui-text">--ui-*</code>{" "}
            and pinned to a colorway by the panel around them.
          </p>
        </header>

        <Colorway theme="night" title="Dark (default)" />
        <Colorway theme="day" title="Light canvas" />
      </div>

      <UtilityDock />
    </main>
  );
}

function Colorway({ theme, title }: { theme: "night" | "day"; title: string }) {
  return (
    <section
      data-theme={theme}
      className="rounded-3xl border border-ui-border bg-ui-bg p-7 text-ui-text"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-medium tracking-tight">{title}</h2>
        <p className="font-mono text-[11px] tracking-wide text-ui-muted uppercase">
          data-theme=&quot;{theme}&quot;
        </p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {TOKENS.map((token) => (
          <div key={token.name} className="flex flex-col gap-2">
            <span
              className="h-12 w-full rounded-lg border border-ui-border"
              style={{ background: `var(${token.name})` }}
            />
            <span className="font-mono text-[10px] leading-tight text-ui-muted">
              {token.name}
            </span>
            <span className="text-[11px] leading-tight text-ui-text">{token.role}</span>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <PillLink href="/pilot">Book a call audit</PillLink>
        <PillButton variant="quiet">Secondary</PillButton>
        <PillButton variant="ghost">Ghost</PillButton>
        <PillButton disabled>Disabled</PillButton>
        <LiveBadge />
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <SurfaceCard interactive>
          <CardTitle>After-hours intake</CardTitle>
          <CardBody>
            Captures the request, proposes an open window, alerts the owner.
          </CardBody>
        </SurfaceCard>
        <SurfaceCard interactive>
          <CardTitle>Capacity-aware booking</CardTitle>
          <CardBody>
            Never promises a slot the schedule cannot cover.
          </CardBody>
        </SurfaceCard>
        <SurfaceCard interactive>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Live line</CardTitle>
            <LiveBadge />
          </div>
          <CardBody>Micro-badge pulses only when motion is allowed.</CardBody>
        </SurfaceCard>
      </div>
    </section>
  );
}
