import type { Metadata } from "next";
import { Orbitron, Space_Grotesk } from "next/font/google";
import { AuthSessionProvider } from "@/components/auth-session-provider";
import { CookieConsent } from "@/components/cookie-consent";
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
    "Orvius answers every call, qualifies the lead, and alerts the owner. Pro adds jobs, dispatch, and Ask. Built for HVAC, plumbing, and electrical.",
  metadataBase: new URL("https://orvius.im"),
  openGraph: {
    title: "Orvius — Every call answered. Every lead owned.",
    description:
      "Call +1 844 643 9170 for the live demo. Dedicated shop line, qualified leads, owner alerts.",
    type: "website",
    url: "https://orvius.im",
    siteName: "Orvius",
  },
  twitter: {
    card: "summary_large_image",
    title: "Orvius — Every call answered. Every lead owned.",
    description:
      "AI receptionist and shop OS for HVAC, plumbing, and electrical.",
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
