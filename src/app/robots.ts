import type { MetadataRoute } from "next";
import { company } from "@/lib/company";

export default function robots(): MetadataRoute.Robots {
  const base = `https://${company.domain}`;
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/admin", "/api"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
