import { ShellHeader } from "@/components/shell-header";
import { SiteFooter } from "@/components/site-footer";
import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <ShellHeader plane="chalk" position="sticky" cta={false} />
      <main className="editorial flex min-h-[80svh] flex-col items-center justify-center bg-chalk px-6 text-center text-void">
        <div className="max-w-md">
          <p className="font-sans text-[11px] font-bold tracking-[0.2em] text-ash uppercase">
            404
          </p>
          <h1 className="mt-4 font-serif text-4xl tracking-[-0.04em] md:text-5xl">
            Page not found
          </h1>
          <p className="mt-4 font-sans text-[0.9375rem] leading-relaxed text-ash">
            This route doesn&apos;t exist. Head back to Orvius — every call
            answered, every lead captured.
          </p>
          <div className="editorial-actions mt-8 justify-center font-sans">
            <Link href="/" className="editorial-cta">
              Back to home
            </Link>
            <Link href="/pilot" className="editorial-link">
              Apply for pilot
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
