import type { MetadataRoute } from "next";
import { orviusColors } from "@/lib/orvius-colors";

/** Lets an owner put Orvius on their home screen and get push alerts from it. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Orvius",
    short_name: "Orvius",
    description: "Your shop's calls, jobs and crew in one place.",
    id: "/dashboard",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: orviusColors.voidDeep,
    theme_color: orviusColors.voidDeep,
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Command", url: "/dashboard" },
      { name: "Calls", url: "/dashboard/calls" },
      { name: "Dispatch", url: "/dashboard/dispatch" },
    ],
  };
}
