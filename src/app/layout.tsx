import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";

const display = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const sans = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: {
    default: "Orvius",
    template: "%s · Orvius",
  },
  description:
    "Orvius is the AI operating partner for service businesses. Every call answered. Every lead captured.",
  metadataBase: new URL("https://orvius.im"),
  openGraph: {
    title: "Orvius — Always answered",
    description:
      "The front door of your business — always answered. Built for HVAC, plumbing, and electrical.",
    type: "website",
    url: "https://orvius.im",
    siteName: "Orvius",
  },
  twitter: {
    card: "summary_large_image",
    title: "Orvius — Always answered",
    description:
      "Every call answered. Every lead captured. Built for service businesses.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${sans.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
