import type { Metadata } from "next";
import { Sora, Orbitron } from "next/font/google";
import { AuthSessionProvider } from "@/components/auth-session-provider";
import { CookieConsent } from "@/components/cookie-consent";
import { company } from "@/lib/company";
import "./globals.css";

/**
 * One letterset — Grok-grade consistency.
 * Sora carries logo wordmark, UI, body, and display.
 * No Syne / Space Grotesk / Barlow / SVG caps fighting each other.
 */
const sans = Sora({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

/** Sci-fi display face for the wordmark + marquee headings. */
const scifi = Orbitron({
  variable: "--font-scifi",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('orvius-theme');if(t==='night'){document.documentElement.setAttribute('data-theme','night');}}catch(e){}})();",
          }}
        />
      </head>
      <body className={`${sans.variable} ${scifi.variable} antialiased`}>
        <AuthSessionProvider>{children}</AuthSessionProvider>
        <CookieConsent />
      </body>
    </html>
  );
}
