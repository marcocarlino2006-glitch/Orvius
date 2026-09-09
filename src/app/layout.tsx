import type { Metadata } from "next";
import { AuthSessionProvider } from "@/components/auth-session-provider";
import { CookieConsent } from "@/components/cookie-consent";
import { company } from "@/lib/company";
import "./globals.css";
import "./public-v2.css";

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
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('orvius-theme');if(t==='night'){document.documentElement.setAttribute('data-theme','night');}}catch(e){}})();",
          }}
        />
      </head>
      <body className="antialiased">
        <AuthSessionProvider>{children}</AuthSessionProvider>
        <CookieConsent />
      </body>
    </html>
  );
}
