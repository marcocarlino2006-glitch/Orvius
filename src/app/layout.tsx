import type { Metadata } from "next";
import { Syne, Literata } from "next/font/google";
import "./globals.css";

const display = Syne({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const body = Literata({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Orvius — Never miss another job",
  description:
    "Orvius is the AI receptionist for service businesses. Answer every call, capture every lead, run with less friction.",
  metadataBase: new URL("https://orvius.im"),
  openGraph: {
    title: "Orvius — Never miss another job",
    description:
      "AI receptionist for HVAC, plumbing, electrical & home services.",
    type: "website",
    url: "https://orvius.im",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
