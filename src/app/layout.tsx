import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, Inter } from "next/font/google";
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
 * Archivo speaks for the brand on public pages; Inter runs the product; Plex Mono speaks
 * whenever the interface is reporting machine truth — times, numbers, statuses,
 * phone lines. Mixing a third letterset is what made the old surfaces read cheap.
 */
const sans = Archivo({
  variable: "--font-sans",
  subsets: ["latin"],
  /* 300 = Cursor-gothic whisper for display; 400–600 for UI; keep 700 for rare emphasis */
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

/* The product itself reads in Inter — neutral, dense, and legible at 13–14px. */
const ui = Inter({
  variable: "--font-ui",
  subsets: ["latin"],
  display: "swap",
});

/* Machine labels and operational evidence use the monospaced reporting voice. */
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
  // Night is the server default so [data-theme] is never absent and the token
  // set is unambiguous. The boot script rewrites it before paint, which is the
  // one divergence suppressHydrationWarning is here to cover.
  return (
    <html lang="en" data-theme="night" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(buildSiteStructuredData()).replace(/</g, "\\u003c"),
          }}
        />
      </head>
      <body className={`${sans.variable} ${mono.variable} ${ui.variable} antialiased`}>
        <AuthSessionProvider>{children}</AuthSessionProvider>
        <CookieConsent />
      </body>
    </html>
  );
}
