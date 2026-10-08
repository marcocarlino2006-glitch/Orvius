/**
 * What Orvius does on its own, what waits for a person, and what it never
 * does, worked out from the shop's actual settings. Each line describes a
 * behavior the code enforces; none of it is aspiration.
 */
export type AuthorityInput = {
  bookingMode?: "book" | "alert" | null;
  autopilot?: boolean | null;
  transferPhone?: string | null;
};

export type Authority = { automatic: string[]; approval: string[]; blocked: string[] };

export function aiAuthority(input: AuthorityInput): Authority {
  const books = (input.bookingMode ?? "book") === "book";
  const routine = input.autopilot ?? true;

  const automatic = [
    "Answer calls and write down who called, what they need and how urgent it is",
    ...(books
      ? [
          "Book callers into one of your real open times",
          "Give each booking to the person whose skills and hours fit",
          "Text the customer their appointment time",
        ]
      : []),
    ...(routine
      ? ["Text customers to confirm upcoming appointments", "Assign open jobs when exactly one person clearly fits"]
      : []),
    ...(input.transferPhone ? ["Transfer callers who ask for a person to your transfer number"] : []),
  ];

  const approval = [
    ...(books ? [] : ["Every booking — Orvius takes the request and you set the time"]),
    ...(routine ? [] : ["Confirmation texts and assigning open jobs"]),
    "Anything typed into Command (book, move, assign) — shown as a plan you approve",
    "Jobs where two people fit equally",
  ];

  const blocked = [
    "Booking emergencies or danger calls (gas, smoke, carbon monoxide, sparking) — they come to you",
    "Quoting a price you haven't listed",
    "Promising an arrival time that didn't come from your schedule",
    ...(input.transferPhone ? [] : ["Transferring callers — with no transfer number you get a callback alert instead"]),
  ];

  return { automatic, approval, blocked };
}
