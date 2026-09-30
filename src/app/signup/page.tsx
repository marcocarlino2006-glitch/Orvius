import { redirect } from "next/navigation";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams({ mode: "signup" });
  if (typeof params.callbackUrl === "string") query.set("callbackUrl", params.callbackUrl);
  redirect(`/signin?${query.toString()}`);
}
