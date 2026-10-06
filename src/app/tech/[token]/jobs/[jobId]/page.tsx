import type { Metadata, Viewport } from "next";
import { TechJob } from "@/components/tech-app/job";
import "../../../tech-app.css";

type PageProps = { params: Promise<{ token: string; jobId: string }> };

export const metadata: Metadata = { title: "Job · Orvius", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#0b0c0e", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function TechJobPage({ params }: PageProps) {
  const { token, jobId } = await params;
  return <TechJob token={token} jobId={jobId} />;
}
