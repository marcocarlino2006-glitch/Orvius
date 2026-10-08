import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import { AuthSessionProvider } from "@/components/auth-session-provider";
import { CookieConsent } from "@/components/cookie-consent";
import { company } from "@/lib/company";
import { buildSiteStructuredData } from "@/lib/structured-data";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";
import "./public-v2.css";
import "./theme-tokens.css";
import "./public-polish.css";

/**
 * One face everywhere: Inter for the site, the product and every number in it
 * (tabular figures keep columns aligned). Plex Mono is kept for code and keys only.
 */
const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

/* Code and keyboard keys only. */
const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: company.searchTitle,
    template: "%s · Orvius",
  },
  description: company.searchDescription,
  metadataBase: new URL(`https://${company.domain}`),
  alternates: { canonical: "/" },
  appleWebApp: { capable: true, title: "Orvius", statusBarStyle: "black-translucent" },
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
  openGraph: {
    title: company.searchTitle,
    description: company.searchDescription,
    type: "website",
    url: `https://${company.domain}`,
    siteName: company.productName,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: `Orvius — ${company.tagline.replace(/\.$/, "")}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: company.searchTitle,
    description: company.searchDescription,
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Paper is the server default so a first paint matches Chase/Amex: light,
  // quiet, one list. The boot script rewrites it before paint if they pinned
  // night or follow the OS, which is the one divergence suppressHydrationWarning covers.
  return (
    <html lang="en" data-theme="day" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(buildSiteStructuredData()).replace(/</g, "\\u003c"),
          }}
        />
      </head>
      <body className={`${sans.variable} ${mono.variable} antialiased`}>
        <AuthSessionProvider>{children}</AuthSessionProvider>
        <CookieConsent />
      </body>
    </html>
  );
}
