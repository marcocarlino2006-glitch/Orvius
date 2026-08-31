import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AuthSessionProvider } from "@/components/auth-session-provider";
import { CookieConsent } from "@/components/cookie-consent";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
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
  description:
    "Orvius is the operating system for service businesses. The system of record for HVAC, plumbing, and electrical.",
  metadataBase: new URL("https://orvius.im"),
  openGraph: {
    title: "Orvius — The operating system for service businesses",
    description:
      "The system of record for the trades. Every call, every customer, every job.",
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
      <body className={`${sans.variable} antialiased`}>
        <AuthSessionProvider>{children}</AuthSessionProvider>
        <CookieConsent />
      </body>
    </html>
  );
}
