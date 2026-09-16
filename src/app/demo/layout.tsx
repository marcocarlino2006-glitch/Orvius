import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live AI call demo",
  description:
    "Call the live Orvius AI or simulate an HVAC, plumbing, or electrical request in the browser. See the structured owner alert and proposed-window flow.",
  alternates: { canonical: "/demo" },
};

export default function DemoLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
