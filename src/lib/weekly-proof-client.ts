/** Client helper — weekly proof ritual (POST stamps; GET is preview-only). */

export type WeeklyProofResult = {
  text: string;
  lastWeeklyProofAt?: string;
  stamped: boolean;
};

export async function copyWeeklyProofRitual(): Promise<WeeklyProofResult> {
  const res = await fetch("/api/shop/weekly-proof", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ windowDays: 7 }),
  });
  if (!res.ok) {
    throw new Error("Could not build weekly proof");
  }
  const data = (await res.json()) as {
    text: string;
    lastWeeklyProofAt?: string;
    stamped?: boolean;
  };
  await navigator.clipboard.writeText(data.text);
  return {
    text: data.text,
    lastWeeklyProofAt: data.lastWeeklyProofAt,
    stamped: Boolean(data.stamped),
  };
}
