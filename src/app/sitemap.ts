import type { MetadataRoute } from "next";
import { company, legalPages } from "@/lib/company";
import { HELP_ARTICLES } from "@/lib/help-center";
import { TRADE_PAGES } from "@/lib/trade-pages";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = `https://${company.domain}`;
  const staticRoutes = [
    "",
    "/watch",
    "/launch",
    "/calls",
    "/try",
    "/product",
    "/enterprise",
    "/pricing",
    "/resources",
    "/help",
    "/pilot",
    "/about",
    "/security",
    "/status",
    "/changelog",
    "/legal",
  ];
  const legal = legalPages.map((p) => p.href);
  const help = HELP_ARTICLES.map((a) => `/help/${a.slug}`);
  const trades = TRADE_PAGES.map((p) => `/for/${p.slug}`);

  return [...staticRoutes, ...trades, ...legal, ...help].map((path) => ({
    url: `${base}${path || "/"}`,
    lastModified: new Date(company.legalUpdated),
  }));
}
