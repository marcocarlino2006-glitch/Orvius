"use client";

import { signOut, useSession } from "next-auth/react";

function initials(name: string | null | undefined, email: string | null | undefined) {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return parts[0]?.slice(0, 2).toUpperCase() ?? "OR";
  }
  return email?.slice(0, 2).toUpperCase() ?? "OR";
}

export function OsSidebarFooter() {
  const { data: session } = useSession();

  if (!session?.user) return null;

  const name = session.user.name ?? "User";
  const email = session.user.email ?? "";

  return (
    <div className="os-sidebar-footer font-sans">
      <button
        type="button"
        className="os-sidebar-user"
        onClick={() => signOut({ callbackUrl: "/" })}
        title="Sign out"
      >
        <span className="os-sidebar-avatar" aria-hidden>
          {initials(session.user.name, session.user.email)}
        </span>
        <span className="os-sidebar-user-meta">
          <span className="os-sidebar-user-name">{name}</span>
          <span className="os-sidebar-user-email">{email}</span>
        </span>
      </button>
    </div>
  );
}
