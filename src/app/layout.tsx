import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans, Space_Grotesk } from "next/font/google";
import { AuthSessionProvider } from "@/components/auth-session-provider";
import { CookieConsent } from "@/components/cookie-consent";
import { company } from "@/lib/company";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";
import "./public-v2.css";
import "./theme-tokens.css";
/* Mission-control tokens load from dashboard/layout after dashboard.css */

/**
 * Four voices, each with a job.
 * - Archivo: marketing / public site (unchanged brand prose)
 * - Space Grotesk: product display (Command titles, briefing)
 * - IBM Plex Sans: product UI body (mission-control clarity)
 * - IBM Plex Mono: machine truth (times, counts, statuses, lines)
 */
const sans = Archivo({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const ui = IBM_Plex_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `Orvius — ${company.tagline.replace(/\.$/, "")}`,
    template: "%s · Orvius",
  },
  description:
    "Orvius answers after-hours and overflow calls for HVAC, plumbing, and electrical shops, captures the request, proposes an open window, and alerts the owner.",
  metadataBase: new URL(`https://${company.domain}`),
  alternates: { canonical: "/" },
  openGraph: {
    title: `Orvius — ${company.tagline.replace(/\.$/, "")}`,
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
        alt: `Orvius — ${company.tagline.replace(/\.$/, "")}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `Orvius — ${company.tagline.replace(/\.$/, "")}`,
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
      <body
        className={`${sans.variable} ${ui.variable} ${display.variable} ${mono.variable} antialiased`}
      >
        <AuthSessionProvider>{children}</AuthSessionProvider>
        <CookieConsent />
      </body>
    </html>
  );
}
