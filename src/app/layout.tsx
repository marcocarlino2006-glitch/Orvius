import type { Metadata } from "next";
import { Orbitron, Space_Grotesk } from "next/font/google";
import { AuthSessionProvider } from "@/components/auth-session-provider";
import { CookieConsent } from "@/components/cookie-consent";
import { company } from "@/lib/company";
import "./globals.css";

const sans = Space_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const brand = Orbitron({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
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
      "Try the live line or book a call audit. Front door today — operating system as you grow.",
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
