import type { Metadata } from "next";
import { DM_Sans, Plus_Jakarta_Sans } from "next/font/google";
import { AuthSessionProvider } from "@/components/auth-session-provider";
import { CookieConsent } from "@/components/cookie-consent";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/** Brand wordmark + marketing headlines — clean, tracked, professional. */
const brand = DM_Sans({
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
    "Orvius is the operating system for service businesses — dedicated line, AI receptionist, inbox, jobs, dispatch, and Ask. Built for HVAC, plumbing, and electrical.",
  metadataBase: new URL("https://orvius.im"),
  openGraph: {
    title: "Orvius — The operating system for service businesses",
    description:
      "Call +1 844 643 9170 for the live demo. Dedicated shop line, qualified leads, owner alerts — one OS for the trades.",
    type: "website",
    url: "https://orvius.im",
    siteName: "Orvius",
  },
  twitter: {
    card: "summary_large_image",
    title: "Orvius — The operating system for service businesses",
    description:
      "The system of record for HVAC, plumbing, and electrical.",
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
