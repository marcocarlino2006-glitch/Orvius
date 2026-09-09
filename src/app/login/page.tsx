import { redirect } from "next/navigation";

/**
 * /login predates /signin and is linked from older emails, docs, and bookmarks.
 * It forwards rather than 404s, carrying the callback and error params so a
 * redirect mid-sign-in still lands the visitor on the right screen.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }
  const suffix = query.toString();
  redirect(suffix ? `/signin?${suffix}` : "/signin");
}
