import { callToCash, type CashThreadInput } from "@/lib/call-to-cash";

/** One call's path to cash, read from the records. Renders nothing when the call never became work. */
export function CallThread({ input }: { input: CashThreadInput }) {
  const thread = callToCash(input);
  if (!thread) return null;
  return (
    <ol className="cmd-thread" aria-label="Where this call stands">
      {thread.map((step) => (
        <li key={step.key} className={`cmd-thread-step cmd-thread-step--${step.state}`} aria-current={step.state === "now" ? "step" : undefined}>
          <i aria-hidden />
          <span>{step.label}</span>
          <span className="sr-only">{step.state === "done" ? ", done" : step.state === "now" ? ", next" : ""}</span>
        </li>
      ))}
    </ol>
  );
}
