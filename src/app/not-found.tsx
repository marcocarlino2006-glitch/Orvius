import { BrandIntro } from "@/components/brand-intro";
import { ShellHeader } from "@/components/shell-header";
import { SiteFooter } from "@/components/site-footer";
import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <ShellHeader plane="chalk" cta={{ href: "/pilot", label: "Free pilot" }} />
      <main className="editorial flex min-h-[80svh] flex-col items-center justify-center bg-chalk px-6 text-center text-void">
        <div className="max-w-md">
          <BrandIntro
            kicker="404"
            title="Page not found."
            subline="This route doesn't exist in the OS."
            description="Head back to Orvius — every call, every customer, every job."
            align="center"
            titleClassName="!text-4xl md:!text-5xl !max-w-none"
          />
          <div className="editorial-actions justify-center font-sans">
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
