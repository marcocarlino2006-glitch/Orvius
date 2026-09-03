import type { MetadataRoute } from "next";
import { company, legalPages } from "@/lib/company";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = `https://${company.domain}`;
  const staticRoutes = ["", "/pricing", "/pilot", "/about", "/demo", "/login", "/legal"];
  const legal = legalPages.map((p) => p.href);

  return [...staticRoutes, ...legal].map((path) => ({
    url: `${base}${path || "/"}`,
    lastModified: new Date(company.legalUpdated),
  }));
}
