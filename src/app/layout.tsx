import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import { AuthSessionProvider } from "@/components/auth-session-provider";
import { CookieConsent } from "@/components/cookie-consent";
import { company } from "@/lib/company";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";
import "./public-v2.css";
import "./theme-tokens.css";

/**
 * Two voices, no more. Archivo speaks in prose and headlines; Plex Mono speaks
 * whenever the interface is reporting machine truth — times, numbers, statuses,
 * phone lines. Mixing a third letterset is what made the old surfaces read cheap.
 */
const sans = Archivo({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Orvius — The AI night shift for the trades",
    template: "%s · Orvius",
  },
  description:
    "Orvius answers after-hours and overflow calls for HVAC, plumbing, and electrical shops, captures the request, proposes an open window, and alerts the owner.",
  metadataBase: new URL(`https://${company.domain}`),
  alternates: { canonical: "/" },
  openGraph: {
    title: "Orvius — The AI night shift for the trades",
    description:
      "Call the live product. Orvius captures after-hours demand, proposes an open service window, and alerts the owner.",
    type: "website",
    url: `https://${company.domain}`,
    siteName: company.productName,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Orvius — The AI night shift for the trades",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Orvius — The AI night shift for the trades",
    description:
      "Call the live product. After-hours intake, capacity-aware scheduling, confirmation, and owner alerts.",
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Night is the server default so [data-theme] is never absent and the token
  // set is unambiguous. The boot script rewrites it before paint, which is the
  // one divergence suppressHydrationWarning is here to cover.
  return (
    <html lang="en" data-theme="night" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className={`${sans.variable} ${mono.variable} antialiased`}>
        <AuthSessionProvider>{children}</AuthSessionProvider>
        <CookieConsent />
      </body>
    </html>
  );
}
