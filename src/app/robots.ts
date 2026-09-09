import type { MetadataRoute } from "next";
import { company } from "@/lib/company";

export default function robots(): MetadataRoute.Robots {
  const base = `https://${company.domain}`;
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/admin", "/api", "/ui-kit"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
