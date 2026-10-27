import Link from "next/link";
import { SAMPLE_ROWS } from "@/lib/sample-preview";
import { SIGNUP_HREF } from "@/lib/signup-href";

/**
 * The desk before a shop exists.
 * Nothing here is loaded from a business. Signing up opens that shop's own number and its own customers.
 */
export function SampleDay() {
  return (
    <section className="cmd cmd-one" aria-label="Sample day">
      <header className="cmd-head">
        <h2 className="cmd-headline">This is a sample day.</h2>
        <p className="cmd-facts">
          <span>Sign up and your shop gets its own number and its own customers.</span>
        </p>
      </header>
      <ol className="sample-rows">
        {SAMPLE_ROWS.map((row) => (
          <li key={row.who} className="wc wc--row">
            <div className="wc-head">
              <div className="wc-main">
                <p className="wc-title">
                  {row.title}
                  <span className="wc-who"> · {row.who}</span>
                </p>
                {row.address ? <p className="wc-where">{row.address}</p> : null}
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="cmd-facts">
        <Link href={SIGNUP_HREF} className="ox-btn ox-btn--primary ox-btn--sm">
          Sign up
        </Link>
      </p>
    </section>
  );
}
