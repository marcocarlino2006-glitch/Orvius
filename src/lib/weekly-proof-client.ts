/** Client helper — weekly proof ritual (POST stamps; GET is preview-only). */

export type WeeklyProofEmailResult =
  | { attempted: false; reason: string }
  | { attempted: true; sent: true; id?: string }
  | { attempted: true; sent: false; reason: string };

export type WeeklyProofResult = {
  text: string;
  lastWeeklyProofAt?: string;
  stamped: boolean;
  email?: WeeklyProofEmailResult;
};

export async function copyWeeklyProofRitual(): Promise<WeeklyProofResult> {
  const res = await fetch("/api/shop/weekly-proof", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ windowDays: 7, email: true }),
  });
  if (!res.ok) {
    throw new Error("Could not build weekly proof");
  }
  const data = (await res.json()) as {
    text: string;
    lastWeeklyProofAt?: string;
    stamped?: boolean;
    email?: WeeklyProofEmailResult;
  };
  await navigator.clipboard.writeText(data.text);
  return {
    text: data.text,
    lastWeeklyProofAt: data.lastWeeklyProofAt,
    stamped: Boolean(data.stamped),
    email: data.email,
  };
}
