"use client";

import { signIn } from "next-auth/react";

type DevSignInButtonProps = {
  callbackUrl?: string;
  email?: string;
};

export function DevSignInButton({
  callbackUrl = "/dashboard",
  email,
}: DevSignInButtonProps) {
  return (
    <button
      type="button"
      className="auth-dev-btn"
      onClick={() => signIn("dev", { callbackUrl })}
    >
      Continue as builder{email ? ` (${email})` : ""}
    </button>
  );
}
