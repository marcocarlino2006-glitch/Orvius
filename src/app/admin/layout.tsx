import { Ring1Provider } from "@/lib/ring1-context";
import type { ReactNode } from "react";
import "../dashboard/dashboard.css";
import "../dashboard/orvius-system.css";
import "../dashboard/orvius-scale.css";
import "../dashboard/settings-center.css";
import "../dashboard/orvius-craft.css";

/** Admin uses OsShell — share the same Command pulse as the dashboard. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <Ring1Provider>{children}</Ring1Provider>;
}
