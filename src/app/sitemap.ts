import type { MetadataRoute } from "next";
import { company, legalPages } from "@/lib/company";
import { HELP_ARTICLES } from "@/lib/help-center";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = `https://${company.domain}`;
  const staticRoutes = [
    "",
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
    "/demo",
    "/legal",
  ];
  const legal = legalPages.map((p) => p.href);
  const help = HELP_ARTICLES.map((a) => `/help/${a.slug}`);

  return [...staticRoutes, ...legal, ...help].map((path) => ({
    url: `${base}${path || "/"}`,
    lastModified: new Date(company.legalUpdated),
  }));
}
