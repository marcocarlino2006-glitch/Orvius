import type { Metadata } from "next";
import { Barlow_Condensed, Space_Grotesk, Syne } from "next/font/google";
import { AuthSessionProvider } from "@/components/auth-session-provider";
import { CookieConsent } from "@/components/cookie-consent";
import { company } from "@/lib/company";
import "./globals.css";

/**
 * Type system — software-company caliber:
 * - Syne — display / hero claims (proprietary feel, not Inter)
 * - Space Grotesk — product UI + body
 * - Barlow Condensed — tracked mission labels / CTAs
 */

const sans = Space_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const brand = Barlow_Condensed({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const display = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Orvius",
    template: "%s · Orvius",
  },
  description: `${company.categoryClaim} ${company.proofLine} Built for HVAC, plumbing, and electrical.`,
  metadataBase: new URL(`https://${company.domain}`),
  openGraph: {
    title: `Orvius — ${company.tagline}`,
    description: `${company.categoryClaim} ${company.proofLine} Call the live line or book an audit.`,
    type: "website",
    url: `https://${company.domain}`,
    siteName: company.productName,
  },
  twitter: {
    card: "summary_large_image",
    title: `Orvius — ${company.tagline}`,
    description: `${company.categoryClaim} ${company.proofLine}`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${sans.variable} ${brand.variable} ${display.variable} antialiased`}
      >
        <AuthSessionProvider>{children}</AuthSessionProvider>
        <CookieConsent />
      </body>
    </html>
  );
}
