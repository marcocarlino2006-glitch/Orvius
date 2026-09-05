import type { Metadata } from "next";
import { Barlow_Condensed, IBM_Plex_Sans } from "next/font/google";
import { AuthSessionProvider } from "@/components/auth-session-provider";
import { CookieConsent } from "@/components/cookie-consent";
import { company } from "@/lib/company";
import "./globals.css";

const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/** Brand face — lockups only. Never body/UI. */
const brand = Barlow_Condensed({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Orvius",
    template: "%s · Orvius",
  },
  description:
    "Orvius answers after-hours and overflow calls, qualifies, books, and alerts the owner. Built for HVAC, plumbing, and electrical.",
  metadataBase: new URL(`https://${company.domain}`),
  openGraph: {
    title: `Orvius — ${company.tagline}`,
    description:
      "Try the live line or book a call audit. Capture missed calls today — grow into the shop OS when you are ready.",
    type: "website",
    url: `https://${company.domain}`,
    siteName: company.productName,
  },
  twitter: {
    card: "summary_large_image",
    title: `Orvius — ${company.tagline}`,
    description:
      "Turn missed calls into booked jobs. AI receptionist and shop OS for the trades.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${brand.variable} antialiased`}>
        <AuthSessionProvider>{children}</AuthSessionProvider>
        <CookieConsent />
      </body>
    </html>
  );
}
