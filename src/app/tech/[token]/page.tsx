import type { Metadata, Viewport } from "next";
import { TechDay } from "@/components/tech-app/day";
import "../tech-app.css";

type PageProps = { params: Promise<{ token: string }> };

export const metadata: Metadata = { title: "Your day · Orvius", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#0b0c0e", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function TechDayPage({ params }: PageProps) {
  const { token } = await params;
  return <TechDay token={token} />;
}
