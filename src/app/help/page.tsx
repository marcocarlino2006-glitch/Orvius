import type { Metadata } from "next";
import { HelpSearch } from "@/components/help-search";
import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { company } from "@/lib/company";
import { HELP_ARTICLES, HELP_CATEGORIES } from "@/lib/help-center";

export const metadata: Metadata = {
  title: "Help center",
  description: `Set up your line, forward calls, and get the most from ${company.productName}.`,
};

export default function HelpPage() {
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap max-w-3xl">
          <ShellPageIntro
            label="Help center"
            title="How can we help?"
            description="Setup, calls, and running your day with Orvius. Every answer describes what the product does today."
          />
        </div>
      </section>
      <section className="tier1-story">
        <div className="editorial-wrap max-w-3xl">
          <HelpSearch
            categories={HELP_CATEGORIES}
            articles={HELP_ARTICLES.map(({ slug, title, summary, category, keywords }) => ({
              slug,
              title,
              summary,
              category,
              keywords,
            }))}
          />
          <p className="help-contact">
            Can’t find it? Email <a href={`mailto:${company.supportEmail}`}>{company.supportEmail}</a> or call{" "}
            <a href="tel:+18446439170">+1 844 643 9170</a>.
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
