import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Orvius — AI Receptionist for Service Businesses",
  description:
    "Never miss a call. Orvius answers, qualifies leads, books appointments, and alerts owners — built for HVAC, plumbing, electrical, and home services.",
  openGraph: {
    title: "Orvius — AI Receptionist for Service Businesses",
    description:
      "Never miss a call. AI receptionist for HVAC, plumbing, electrical & home services.",
    type: "website",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
