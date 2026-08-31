import { BrandIntro } from "@/components/brand-intro";
import { PublicLayout } from "@/components/marketing-shell";
import Link from "next/link";

export default function NotFound() {
  return (
    <PublicLayout>
      <section className="marketing-hero marketing-hero-center min-h-[70svh] flex flex-col justify-center">
        <div className="editorial-wrap max-w-md mx-auto text-center">
          <BrandIntro
            kicker="404"
            title="Page not found."
            subline="This route doesn't exist in the OS."
            description="Head back to Orvius — every call, every customer, every job."
            align="center"
            titleClassName="marketing-hero-title-sm"
          />
          <div className="marketing-actions justify-center font-sans mt-8">
            <Link href="/" className="tier-btn tier-btn-primary">
              Back to home
            </Link>
            <Link href="/pilot" className="home-platform-link">
              Apply for pilot →
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
