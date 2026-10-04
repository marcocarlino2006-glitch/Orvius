import { company } from "@/lib/company";
import { pricingPlans } from "@/lib/pricing-plans";

/**
 * schema.org data for search engines: who we are (so results show "Orvius" as
 * the site name, with our logo) and what we sell, priced from the real plans
 * so the search listing can never drift from the pricing page.
 */
export function buildSiteStructuredData() {
  const url = `https://${company.domain}`;
  const paid = pricingPlans.filter((p) => !p.contactSales && p.price > 0).map((p) => p.price);
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: company.productName,
      url,
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: company.productName,
      legalName: company.legalName,
      url,
      logo: `${url}/apple-icon`,
      email: company.contactEmail,
      description: company.mission,
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: company.productName,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url,
      description: company.searchDescription,
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "USD",
        lowPrice: Math.min(...paid),
        highPrice: Math.max(...paid),
        offerCount: paid.length,
      },
    },
  ];
}
