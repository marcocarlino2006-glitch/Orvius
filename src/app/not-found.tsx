import { ShellHeader } from "@/components/shell-header";
import { SiteFooter } from "@/components/site-footer";
import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <ShellHeader plane="void" position="sticky" surface="glass" cta={false} />
      <main className="orvius-atmosphere relative flex min-h-[80svh] flex-col items-center justify-center bg-void px-6 text-center text-chalk">
        <div className="orvius-grain absolute inset-0" aria-hidden />
        <div className="relative max-w-md">
          <p className="eyebrow">404</p>
          <h1 className="mt-4 font-serif text-4xl tracking-[-0.04em] md:text-5xl">
            Page not found
          </h1>
          <p className="mt-4 font-sans text-[0.9375rem] leading-relaxed text-ash-soft">
            This route doesn&apos;t exist. Head back to Orvius — every call
            answered, every lead captured.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/" className="btn btn-on-void">
              Back to home
            </Link>
            <Link href="/pilot" className="btn btn-on-void-secondary">
              Apply for pilot
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
