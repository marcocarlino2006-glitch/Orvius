/**
 * Why the caller rang: a new problem, or something about work already booked.
 * A booked customer asking "what time is the tech coming?" must never become a
 * second job, and a cancellation must never become a new booking.
 */
export type CallIntent = "cancel" | "reschedule" | "status" | "new";

const CANCEL =
  /\bcancel(?:l?ing|l?ed|lation)?\b|\bcall (?:it |the (?:visit|appointment) )?off\b|don'?t need (?:the|a|you to) (?:tech|technician|visit|appointment|come)|\bcancelar\b/i;

const RESCHEDULE =
  /\breschedul|\bmove (?:my|the|our) (?:appointment|visit)|\bpush (?:it|my appointment|the visit) back|different (?:day|time)|change (?:my|the) (?:appointment|visit|time)|\bcambiar (?:la|mi) cita\b/i;

const STATUS =
  /what time (?:is|will|does) (?:the|my|your) (?:tech|technician|guy|plumber|electrician)|when (?:is|will) (?:the|my|your) (?:tech|technician|guy|plumber|electrician)|(?:check(?:ing)?|follow(?:ing)? up) on (?:my|the|our) (?:appointment|visit|request|job)|appointment time|\b(?:is|are) (?:he|they|the tech) (?:still )?(?:coming|on (?:the|his|their) way)|\beta\b|\brunning late\b|(?:already )?(?:have|had|booked) an appointment|(?:make|making) sure you got my request|confirm(?:ing)? (?:my|the) (?:appointment|visit)/i;

export function detectCallIntent(...texts: (string | null | undefined)[]): CallIntent {
  const text = texts.filter(Boolean).join(" \n ");
  if (!text.trim()) return "new";
  if (CANCEL.test(text)) return "cancel";
  if (RESCHEDULE.test(text)) return "reschedule";
  if (STATUS.test(text)) return "status";
  return "new";
}
