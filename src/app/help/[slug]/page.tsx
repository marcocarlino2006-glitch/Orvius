import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { company } from "@/lib/company";
import { getHelpArticle, HELP_ARTICLES } from "@/lib/help-center";

export function generateStaticParams() {
  return HELP_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const article = getHelpArticle((await params).slug);
  return article ? { title: `${article.title} · Help`, description: article.summary } : {};
}

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const article = getHelpArticle((await params).slug);
  if (!article) notFound();
  const related = HELP_ARTICLES.filter((a) => a.category === article.category && a.slug !== article.slug).slice(0, 3);

  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap max-w-3xl">
          <nav className="help-crumbs" aria-label="Breadcrumb">
            <Link href="/help">← Help center</Link>
          </nav>
          <ShellPageIntro label={article.category} title={article.title} description={article.summary} />
        </div>
      </section>
      <section className="tier1-story">
        <div className="editorial-wrap max-w-3xl">
          <article className="legal-prose">{article.body}</article>
          {related.length ? (
            <aside className="help-related" aria-label="Related articles">
              <h2 className="help-group-title">Related</h2>
              <ul className="help-list">
                {related.map((a) => (
                  <li key={a.slug}>
                    <Link href={`/help/${a.slug}`} className="help-card">
                      <span className="help-card-title">{a.title}</span>
                      <span className="help-card-summary">{a.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}
          <p className="help-contact">
            Still stuck? Email <a href={`mailto:${company.supportEmail}`}>{company.supportEmail}</a>.{" "}
            <Link href="/help">All help articles</Link>
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
