import Link from "next/link";
import { demoLineHref } from "@/lib/demo-line";
import { getPublicLaunchReadiness } from "@/lib/public-launch-readiness";
import { SIGNUP_HREF } from "@/lib/signup-href";

/*
  While card signup is open, the way in is signup and the live line is the
  proof beside it. Only when it's closed does the call audit stand in, so no
  page sends a ready buyer to a waitlist.
*/
export function StartActions({ signupOpen = getPublicLaunchReadiness().ready }: { signupOpen?: boolean }) {
  return signupOpen ? (
    <>
      <Link href={SIGNUP_HREF} className="ov-btn ov-btn--solid">
        Get your line
      </Link>
      <a href={demoLineHref()} className="ov-btn ov-btn--quiet">
        Call the live line
      </a>
    </>
  ) : (
    <>
      <a href={demoLineHref()} className="ov-btn ov-btn--solid">
        Call the live line
      </a>
      <Link href="/pilot" className="ov-btn ov-btn--quiet">
        Book a call audit
      </Link>
    </>
  );
}
