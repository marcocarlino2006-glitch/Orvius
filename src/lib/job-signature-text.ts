import { formatCentsExact } from "@/lib/money";

/** The exact words the customer agrees to; shown above the box and stored with the signature. */
export function signatureStatement(agreedCents: number | null) {
  return agreedCents != null && agreedCents > 0 ? `I approve the work listed and the total of ${formatCentsExact(agreedCents)}.` : "I approve the work listed.";
}
