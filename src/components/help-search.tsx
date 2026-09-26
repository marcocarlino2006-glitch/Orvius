"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type HelpIndexEntry = { slug: string; title: string; summary: string; category: string; keywords: string };

export function HelpSearch({ articles, categories }: { articles: HelpIndexEntry[]; categories: string[] }) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return articles.filter((a) => {
      const hay = `${a.title} ${a.summary} ${a.keywords} ${a.category}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [articles, query]);

  return (
    <div className="help-index">
      <label className="help-search">
        <span className="sr-only">Search help</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search — forwarding, alerts, calendar…"
          autoComplete="off"
        />
      </label>

      {matches.length === 0 ? (
        <p className="help-empty">
          Nothing matches "{query}". Try another word, or email{" "}
          <a href="mailto:hello@orvius.im">hello@orvius.im</a>.
        </p>
      ) : (
        categories.map((category) => {
          const inCategory = matches.filter((a) => a.category === category);
          if (!inCategory.length) return null;
          return (
            <section key={category} className="help-group" aria-labelledby={`help-${category}`}>
              <h2 id={`help-${category}`} className="help-group-title">
                {category}
              </h2>
              <ul className="help-list">
                {inCategory.map((a) => (
                  <li key={a.slug}>
                    <Link href={`/help/${a.slug}`} className="help-card">
                      <span className="help-card-title">{a.title}</span>
                      <span className="help-card-summary">{a.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
