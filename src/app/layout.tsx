import type { Metadata } from "next";
import { IBM_Plex_Sans, Space_Grotesk } from "next/font/google";
import { AuthSessionProvider } from "@/components/auth-session-provider";
import { CookieConsent } from "@/components/cookie-consent";
import { company } from "@/lib/company";
import "./globals.css";

/**
 * Institutional letterset — Stripe/Chase weight without stealing their look.
 * Space Grotesk: brand + display (industrial mass).
 * IBM Plex Sans: product + body (bank/ops clarity).
 */
const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
      <body className={`${sans.variable} ${display.variable} antialiased`}>
        <AuthSessionProvider>{children}</AuthSessionProvider>
        <CookieConsent />
      </body>
    </html>
  );
}
