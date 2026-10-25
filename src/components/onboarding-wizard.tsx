"use client";

import { OnboardingCallVerify } from "@/components/onboarding-call-verify";
import { OrviusLogo } from "@/components/orvius-logo";
import { company } from "@/lib/company";
import { readPreviewDraft } from "@/lib/preview-draft";
import { getPlanById, type BillingInterval, type PaidPlanId } from "@/lib/pricing-plans";
import { HIPAA_TRADE_REFUSAL, NOT_YET_TRADE, OFFERED_TRADES, isHipaaTrade, isLaunchTrade, isTrade, type Trade } from "@/lib/trades";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Provisioning = {
  state: "running" | "failed_before_submission" | "failed_kept" | "outcome_unknown" | "succeeded";
  resume: boolean;
  reusesNumber: boolean;
  reusesReceptionist: boolean;
  error: string | null;
};

type ResumePayload = {
  provisioned?: boolean;
  provisioning?: Provisioning | null;
  checkoutSessionId?: string | null;
  ready?: boolean;
  setup?: { line?: string | null; nextStep?: string };
  business?: {
    name?: string;
    ownerPhone?: string | null;
  } | null;
};

const SETUP_DRAFT_KEY = "orvius:setup-draft";
const PAID_PLANS: PaidPlanId[] = ["line", "pro", "fleet"];

type SetupDraft = {
  name: string;
  trade: Trade;
  ownerPhone: string;
  areaCode: string;
  found?: { address: string | null; hoursJson: string | null; source: string } | null;
};

type FoundShop = {
  name: string;
  address: string | null;
  hoursJson: string | null;
  trade: Trade | null;
  source: "website" | "google";
};

/** A form copy and its edit count; the higher count is the newer form wherever it was typed. */
type RevDraft = SetupDraft & { rev: number };

/** Where the typed form is kept right now. Payment never waits on it. */
type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "local"; reason: string }
  | { kind: "replaced" };

function toDraft(d: Partial<RevDraft> | null | undefined): RevDraft | null {
  if (!d || typeof d.name !== "string") return null;
  return {
    name: d.name,
    trade: isTrade(d.trade) ? d.trade : "HVAC",
    ownerPhone: d.ownerPhone ?? "",
    areaCode: d.areaCode ?? "",
    found: d.found ?? null,
    rev: typeof d.rev === "number" && d.rev >= 0 ? d.rev : 0,
  };
}

function readSetupDraft(): RevDraft | null {
  try {
    return toDraft(JSON.parse(window.localStorage.getItem(SETUP_DRAFT_KEY) ?? "null") as Partial<RevDraft> | null);
  } catch {
    return null;
  }
}

function writeSetupDraft(draft: RevDraft) {
  try {
    window.localStorage.setItem(SETUP_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* Private mode keeps nothing on the device; the account copy still restores the form. */
  }
}

async function readServerDraft(): Promise<RevDraft | null> {
  try {
    const res = await fetch("/api/setup/draft", { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { draft?: Partial<RevDraft> | null; rev?: number };
    const d = toDraft(json.draft);
    return d ? { ...d, rev: typeof json.rev === "number" ? json.rev : d.rev } : null;
  } catch {
    return null;
  }
}

const draftKey = (d: SetupDraft) => JSON.stringify({ name: d.name, trade: d.trade, ownerPhone: d.ownerPhone, areaCode: d.areaCode, found: d.found ?? null });

function clearDrafts() {
  try {
    window.localStorage.removeItem(SETUP_DRAFT_KEY);
  } catch {
    /* Private mode keeps nothing to clear. */
  }
  void fetch("/api/setup/draft", { method: "DELETE" }).catch(() => undefined);
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One form, then the card, then the line. The shop details travel with the
 * checkout, so coming back from Stripe builds the line with nothing to type;
 * the form only reappears for a checkout that carried no details.
 */
export function OnboardingWizard({ checkoutOpen = true }: { checkoutOpen?: boolean } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSessionId = searchParams.get("session_id")?.trim() ?? "";
  const planParam = searchParams.get("plan") as PaidPlanId | null;
  const planId: PaidPlanId = planParam && PAID_PLANS.includes(planParam) ? planParam : "pro";
  const interval: BillingInterval = searchParams.get("interval") === "year" ? "year" : "month";
  const canceled = searchParams.get("canceled") === "1";
  const [building, setBuilding] = useState(false);
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupGoogle, setLookupGoogle] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupResults, setLookupResults] = useState<FoundShop[] | null>(null);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [found, setFound] = useState<SetupDraft["found"]>(null);
  const [recoveredSessionId, setRecoveredSessionId] = useState("");
  const checkoutSessionId = urlSessionId || recoveredSessionId;
  const recoveredRef = useRef("");
  const [name, setName] = useState("");
  const [trade, setTrade] = useState<Trade>("HVAC");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provisionedLine, setProvisionedLine] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedSms, setAcceptedSms] = useState(false);
  /** What callers will hear, and the versions the server checks the approval against. */
  const [notice, setNotice] = useState<{ notice: string; noticeVersion: string; setupVersion: string } | null>(null);
  const [approvedNotice, setApprovedNotice] = useState(false);
  const [resuming, setResuming] = useState(true);
  /** The first look for an existing shop failed, so we can't tell new from already paid. */
  const [checkFailed, setCheckFailed] = useState(false);
  const [checkAttempt, setCheckAttempt] = useState(0);
  const [areaCode, setAreaCode] = useState("");
  const [areaCodeTouched, setAreaCodeTouched] = useState(false);
  const [numbers, setNumbers] = useState<string[] | null>(null);
  const [numbersSearchable, setNumbersSearchable] = useState(true);
  const [searching, setSearching] = useState(false);
  const [pickedNumber, setPickedNumber] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [provisioning, setProvisioning] = useState<Provisioning | null>(null);
  const revRef = useRef(0);
  const savedKeyRef = useRef<string | null>(null);
  const restoredRef = useRef(false);

  /* `replace`: the account's newer copy wins whole, so an empty area code there clears this form's too. */
  const applyDraft = useCallback((d: SetupDraft, replace = false) => {
    setName(d.name);
    setTrade(d.trade);
    setOwnerPhone(d.ownerPhone);
    if (d.areaCode || replace) {
      setAreaCode(d.areaCode ?? "");
      setAreaCodeTouched(Boolean(d.areaCode));
    }
    setFound(d.found ?? null);
  }, []);

  const pushDraft = useCallback(
    async (draft: RevDraft) => {
      setSaveState({ kind: "saving" });
      try {
        const res = await fetch("/api/setup/draft", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        const json = (await res.json().catch(() => ({}))) as { code?: string; draft?: Partial<RevDraft>; rev?: number };
        /* A later edit has its own save on the way; this answer is about an older form. */
        if (draft.rev !== revRef.current) return;
        if (res.ok) {
          savedKeyRef.current = draftKey(draft);
          setSaveState({ kind: "saved" });
          return;
        }
        const newer = res.status === 409 && json.code === "stale_draft" ? toDraft(json.draft) : null;
        if (newer) {
          revRef.current = Math.max(newer.rev, json.rev ?? 0);
          savedKeyRef.current = draftKey(newer);
          writeSetupDraft({ ...newer, rev: revRef.current });
          applyDraft(newer, true);
          setSaveState({ kind: "replaced" });
          return;
        }
        setSaveState({
          kind: "local",
          reason:
            res.status === 401
              ? "sign in again to save it to your account"
              : res.status === 429
                ? "saving paused for a minute"
                : "your account didn't take the save",
        });
      } catch {
        if (draft.rev === revRef.current) setSaveState({ kind: "local", reason: "no connection" });
      }
    },
    [applyDraft],
  );

  const currentDraft = useCallback(
    (): RevDraft => ({ name, trade, ownerPhone, areaCode, found: found ?? null, rev: revRef.current }),
    [name, trade, ownerPhone, areaCode, found],
  );

  /* Every edit counts once, lands on the device at once and on the account shortly after. */
  useEffect(() => {
    if (!restoredRef.current || provisionedLine) return;
    const draft = { name, trade, ownerPhone, areaCode, found: found ?? null };
    if (draftKey(draft) === savedKeyRef.current) return;
    revRef.current += 1;
    const next: RevDraft = { ...draft, rev: revRef.current };
    writeSetupDraft(next);
    const timer = window.setTimeout(() => void pushDraft(next), 700);
    return () => window.clearTimeout(timer);
  }, [name, trade, ownerPhone, areaCode, found, provisionedLine, pushDraft]);

  useEffect(() => {
    if (saveState.kind !== "local") return;
    const retry = () => void pushDraft(currentDraft());
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [saveState, pushDraft, currentDraft]);

  useEffect(() => {
    if (areaCodeTouched) return;
    const digits = ownerPhone.replace(/\D/g, "");
    const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    if (national.length === 10 && /^[2-9]/.test(national)) setAreaCode(national.slice(0, 3));
  }, [ownerPhone, areaCodeTouched]);

  useEffect(() => {
    setNumbers(null);
    setPickedNumber(null);
  }, [areaCode]);

  useEffect(() => {
    const shopName = name.trim();
    if (shopName.length < 2) {
      setNotice(null);
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      fetch(`/api/onboarding/activation-terms?name=${encodeURIComponent(shopName)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((terms) => {
          if (!live) return;
          setNotice((current) => {
            if (current?.noticeVersion !== terms?.noticeVersion || current?.setupVersion !== terms?.setupVersion) setApprovedNotice(false);
            return terms;
          });
        })
        .catch(() => live && setNotice(null));
    }, 350);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [name]);

  const activationClaim = notice && approvedNotice
    ? { recording: true as const, approved: true as const, noticeVersion: notice.noticeVersion, setupVersion: notice.setupVersion }
    : undefined;

  async function searchNumbers() {
    if (!/^[2-9]\d{2}$/.test(areaCode)) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/onboarding/numbers?areaCode=${areaCode}`);
      const json = (await res.json()) as { numbers?: string[]; searchable?: boolean };
      setNumbers(json.numbers ?? []);
      setNumbersSearchable(json.searchable !== false);
      setPickedNumber(json.numbers?.[0] ?? null);
    } catch {
      setNumbers([]);
      setNumbersSearchable(false);
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    fetch("/api/onboarding/lookup")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { google?: boolean } | null) => setLookupGoogle(Boolean(json?.google)))
      .catch(() => undefined);
  }, []);

  async function findShop() {
    const q = lookupQuery.trim();
    if (q.length < 3) return;
    setLookingUp(true);
    setLookupNote(null);
    setLookupResults(null);
    try {
      const res = await fetch(`/api/onboarding/lookup?q=${encodeURIComponent(q)}`);
      const json = (await res.json()) as { found?: FoundShop[]; reason?: string; error?: string };
      const results = json.found ?? [];
      if (results.length === 1) pickShop(results[0]!);
      else setLookupResults(results);
      if (!results.length) setLookupNote(json.reason ?? json.error ?? "No match. Fill it in below.");
    } catch {
      setLookupNote("Couldn't look that up. Fill it in below.");
    } finally {
      setLookingUp(false);
    }
  }

  function pickShop(shop: FoundShop) {
    setName(shop.name);
    if (shop.trade && isHipaaTrade(shop.trade)) {
      setLookupResults(null);
      setLookupNote(HIPAA_TRADE_REFUSAL);
      return;
    }
    if (shop.trade && !isLaunchTrade(shop.trade)) {
      setLookupResults(null);
      setLookupNote(NOT_YET_TRADE);
      return;
    }
    if (shop.trade) setTrade(shop.trade);
    setFound({ address: shop.address, hoursJson: shop.hoursJson, source: shop.source });
    setLookupResults(null);
    const from = shop.source === "google" ? "your Google listing" : "your website";
    const used = [shop.address ? "address" : null, shop.hoursJson ? "hours" : null].filter(Boolean).join(" and ");
    setLookupNote(
      used
        ? `Filled from ${from}. Your receptionist will use your ${used}; you can change ${shop.address && shop.hoursJson ? "them" : "it"} anytime in Settings.`
        : `Filled your name from ${from}. Check the business type below.`,
    );
  }

  const foundFields = {
    ...(found?.address ? { address: found.address } : {}),
    ...(found?.hoursJson ? { hoursJson: found.hoursJson } : {}),
  };

  const resumeExisting = useCallback(async () => {
    const res = await fetch("/api/onboarding?resume=1");
    if (res.status === 401) {
      window.location.href = `/signin?callbackUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return true;
    }
    if (!res.ok) throw new Error(`resume check ${res.status}`);
    const json = (await res.json()) as ResumePayload;
    setProvisioning(json.provisioning ?? null);
    if (!json.provisioned || !json.business) {
      if (json.checkoutSessionId) {
        recoveredRef.current = json.checkoutSessionId;
        setRecoveredSessionId(json.checkoutSessionId);
      }
      return false;
    }

    if (json.ready) {
      router.replace("/dashboard?live=1");
      return true;
    }

    setName(json.business.name?.trim() ?? "");
    setOwnerPhone(json.business.ownerPhone?.trim() ?? "");
    const line = json.setup?.line?.trim() ?? null;
    if (line) {
      setProvisionedLine(line);
      setError(null);
    } else {
      setError(
        "Your shop exists, but its line is still provisioning. Try again in a moment.",
      );
    }
    return true;
  }, [router]);

  /* Coming back from Stripe: build from the details on the checkout. The
     webhook may already be building it, so busy or not-yet-paid means wait
     and look again rather than fail. */
  const buildFromCheckout = useCallback(
    async (sessionId: string) => {
      setBuilding(true);
      setError(null);
      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const res = await fetch("/api/onboarding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ checkoutSessionId: sessionId }),
          });
          const json = (await res.json().catch(() => ({}))) as {
            error?: string;
            code?: string;
            line?: string | null;
            activation?: { notice: string; noticeVersion: string; setupVersion: string };
            provisioning?: Provisioning | null;
          };
          setProvisioning(res.ok ? null : (json.provisioning ?? null));
          if (json.code === "activation_needed" && json.activation) {
            setNotice(json.activation);
            setApprovedNotice(false);
            setError(json.error ?? "Approve what callers will hear to finish.");
            return;
          }
          if (res.ok) {
            clearDrafts();
            if (json.line) setProvisionedLine(json.line);
            else router.replace("/dashboard");
            return;
          }
          if (json.code === "shop_details_needed") return;
          if (res.status !== 409 && res.status !== 402) {
            setError(json.error ?? "Setup failed. Try again.");
            return;
          }
          for (let look = 0; look < 12; look += 1) {
            await wait(2500);
            if (await resumeExisting().catch(() => false)) {
              clearDrafts();
              return;
            }
          }
          if (attempt === 1) setError(json.error ?? "Setup is taking longer than usual. Refresh in a minute.");
        }
      } catch {
        setError("Network error. Check your connection and refresh.");
      } finally {
        setBuilding(false);
      }
    },
    [resumeExisting, router],
  );

  useEffect(() => {
    setCheckFailed(false);
    void resumeExisting()
      .then(async (resumed) => {
        if (resumed) return;
        /* The account copy wins unless this device holds later typing it never got to save. */
        const local = readSetupDraft();
        const server = await readServerDraft();
        const saved = server && (!local || server.rev >= local.rev) ? server : local;
        revRef.current = Math.max(local?.rev ?? 0, server?.rev ?? 0);
        if (server && saved === server) savedKeyRef.current = draftKey(server);
        const draft = readPreviewDraft();
        const shopName = saved?.name || draft?.shopName;
        const phone = saved?.ownerPhone || draft?.ownerPhone;
        if (shopName) setName((current) => current || shopName);
        if (phone) setOwnerPhone((current) => current || phone);
        if (saved?.trade) setTrade(saved.trade);
        else if (draft?.trade) setTrade(draft.trade);
        if (saved?.found) setFound(saved.found);
        if (saved?.areaCode) {
          setAreaCode(saved.areaCode);
          setAreaCodeTouched(true);
        }
        if (server && saved === server) setSaveState({ kind: "saved" });
        restoredRef.current = true;
        const paidSession = urlSessionId || recoveredRef.current;
        if (paidSession) void buildFromCheckout(paidSession);
      })
      .catch(() => {
        /* Unknown is not "new": showing the form here could take a second payment from a shop that already paid. */
        setCheckFailed(true);
      })
      .finally(() => setResuming(false));
  }, [resumeExisting, buildFromCheckout, urlSessionId, checkAttempt]);

  async function continueToPayment() {
    setSubmitting(true);
    setError(null);
    const shop = {
      name: name.trim(),
      trade,
      ownerPhone: ownerPhone.trim(),
      ...(/^[2-9]\d{2}$/.test(areaCode) ? { areaCode } : {}),
      ...(pickedNumber ? { phoneNumber: pickedNumber } : {}),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...foundFields,
      acceptedTerms,
      acceptedSms,
    };
    /* Kept for coming back from checkout; the card step never waits on the account copy. */
    const latest = currentDraft();
    writeSetupDraft(latest);
    if (draftKey(latest) !== savedKeyRef.current) void pushDraft(latest);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, interval, shop, activation: activationClaim }),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string; code?: string; manageUrl?: string };
      if (res.ok && json.url) {
        window.location.href = json.url;
        return;
      }
      if (res.status === 401) {
        window.location.href = `/signin?mode=signup&callbackUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        return;
      }
      if (json.code === "already_subscribed" && json.manageUrl) {
        window.location.href = json.manageUrl;
        return;
      }
      setError(json.error ?? "Checkout isn't available right now. Try again.");
    } catch {
      setError("Network error. Check your connection and try again.");
    }
    setSubmitting(false);
  }

  async function finish() {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          trade,
          ownerPhone: ownerPhone.trim(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...foundFields,
          checkoutSessionId,
          ...(/^[2-9]\d{2}$/.test(areaCode) ? { areaCode } : {}),
          ...(pickedNumber ? { phoneNumber: pickedNumber } : {}),
          activation: activationClaim,
        }),
      });

      const json = (await res.json()) as {
        error?: string;
        code?: string;
        line?: string | null;
        activation?: { notice: string; noticeVersion: string; setupVersion: string };
        provisioning?: Provisioning | null;
      };
      setProvisioning(res.ok ? null : (json.provisioning ?? null));
      if (json.code === "activation_needed" && json.activation) {
        setNotice(json.activation);
        setApprovedNotice(false);
        setError(json.error ?? "Approve what callers will hear to finish.");
        return;
      }
      if (!res.ok) {
        if (res.status === 409 && (await resumeExisting().catch(() => false))) return;
        setError(json.error ?? "Setup failed. Try again.");
        return;
      }

      if (json.line) {
        setProvisionedLine(json.line);
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canCreate =
    name.trim().length >= 2 &&
    ownerPhone.trim().length >= 10 &&
    acceptedTerms &&
    acceptedSms &&
    Boolean(activationClaim) &&
    !submitting;

  if (resuming || checkFailed) {
    return (
      <main className="onboarding-shell onboarding-shell--craft onboarding-shell--night">
        <div className="onboarding-glow" aria-hidden />
        <div className="onboarding-frame">
          <header className="onboarding-header">
            <OrviusLogo size="md" variant="void" />
            <p className="onboarding-eyebrow font-sans">
              {company.productName} setup
            </p>
          </header>
          {checkFailed && !resuming ? (
            <div className="onboarding-panel" role="alert">
              <p className="onboarding-lead font-sans">We couldn&apos;t check whether your shop is already set up, so nothing is shown yet and nothing was charged.</p>
              <button
                type="button"
                className="ox-btn ox-btn--primary"
                onClick={() => {
                  setResuming(true);
                  setCheckAttempt((n) => n + 1);
                }}
              >
                Try again
              </button>
            </div>
          ) : (
            <div className="onboarding-panel" aria-busy="true">
              <p className="onboarding-lead font-sans">Opening setup…</p>
            </div>
          )}
        </div>
      </main>
    );
  }

  const paying = !checkoutSessionId && !provisionedLine;
  const plan = getPlanById(planId);
  const planPrice = interval === "year" ? (plan.annualPrice ?? plan.price) : plan.price;

  if (building && !provisionedLine) {
    return (
      <main className="onboarding-shell onboarding-shell--craft onboarding-shell--night">
        <div className="onboarding-glow" aria-hidden />
        <div className="onboarding-frame">
          <header className="onboarding-header">
            <OrviusLogo size="md" variant="void" />
            <p className="onboarding-eyebrow font-sans">{company.productName} setup</p>
          </header>
          <div className="onboarding-panel" aria-busy="true">
            <h1 className="onboarding-title font-sans">Setting up {name.trim() || "your shop"}&apos;s line.</h1>
            <p className="onboarding-lead font-sans" aria-live="polite">
              Getting your number and setting up your receptionist. This usually takes under a minute; nothing to fill in.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (paying && !checkoutOpen) {
    return (
      <main className="onboarding-shell onboarding-shell--craft onboarding-shell--night">
        <div className="onboarding-glow" aria-hidden />
        <div className="onboarding-frame">
          <header className="onboarding-header">
            <OrviusLogo size="md" variant="void" />
            <p className="onboarding-eyebrow font-sans">
              {company.productName} setup
            </p>
          </header>
          <div className="onboarding-panel">
            <h1 className="onboarding-title font-sans">We set up new shops with you.</h1>
            <p className="onboarding-lead font-sans">
              Card signup isn&apos;t open yet. Book a call audit and we&apos;ll get your line answering with you on the call.
            </p>
            <div className="onboarding-actions">
              <Link href="/pilot" className="btn btn-void font-sans">
                Book a call audit
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="onboarding-shell onboarding-shell--craft onboarding-shell--night">
      <div className="onboarding-glow" aria-hidden />

      <div className="onboarding-frame">
        <header className="onboarding-header">
          <OrviusLogo size="md" variant="void" />
          <p className="onboarding-eyebrow font-sans">{company.productName} setup</p>
        </header>

        <div className="onboarding-panel">
          {provisionedLine ? (
            <OnboardingCallVerify line={provisionedLine} shopName={name.trim() || "your shop"} />
          ) : (
            <>
              <h1 className="onboarding-title font-sans">Get your shop line.</h1>
              <p className="onboarding-lead font-sans">
                {paying
                  ? "Your shop name and mobile, then your card. Your number and receptionist are ready when you're back."
                  : "Payment received. Enter your shop name and mobile to get your number."}
              </p>
              {provisioning?.resume ? (
                <ProvisioningNote
                  status={provisioning}
                  canResume={Boolean(checkoutSessionId)}
                  busy={building}
                  onResume={() => void buildFromCheckout(checkoutSessionId)}
                  onRecheck={() => {
                    setResuming(true);
                    setCheckAttempt((n) => n + 1);
                  }}
                />
              ) : null}
              {canceled && paying ? (
                <p className="onboarding-hint font-sans" role="status">
                  Checkout closed before payment. Nothing was charged; your details are still here.
                </p>
              ) : null}

              <div className="onboarding-form">
                <div className="onboarding-field font-sans">
                  <label className="onboarding-label" htmlFor="onboarding-lookup">
                    {lookupGoogle ? "Your website or Google listing" : "Your website"}{" "}
                    <span className="onboarding-label-optional">optional</span>
                  </label>
                  <form
                    className="onboarding-area-row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void findShop();
                    }}
                  >
                    <input
                      id="onboarding-lookup"
                      type="text"
                      value={lookupQuery}
                      onChange={(e) => setLookupQuery(e.target.value)}
                      placeholder={lookupGoogle ? "raysheating.com or Ray's Heating, Austin" : "raysheating.com"}
                      className="onboarding-input"
                      autoComplete="url"
                      autoFocus
                    />
                    <button type="submit" className="btn btn-ghost font-sans" disabled={lookupQuery.trim().length < 3 || lookingUp}>
                      {lookingUp ? "Looking…" : "Fill in"}
                    </button>
                  </form>
                  {lookupResults && lookupResults.length > 1 ? (
                    <div className="onboarding-trade-grid" role="radiogroup" aria-label="Which one is your shop?">
                      {lookupResults.map((shop) => (
                        <button
                          key={`${shop.name}-${shop.address}`}
                          type="button"
                          role="radio"
                          aria-checked={false}
                          className="onboarding-trade"
                          onClick={() => pickShop(shop)}
                        >
                          {shop.name}
                          {shop.address ? ` · ${shop.address}` : ""}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <span className="onboarding-hint" aria-live="polite">
                    {lookupNote ?? "We fill in your name, hours and address so you don't type them."}
                  </span>
                </div>

                <label className="onboarding-field font-sans">
                  <span className="onboarding-label">Shop name</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your business name"
                    className="onboarding-input"
                    autoComplete="organization"
                    maxLength={80}
                  />
                </label>

                <fieldset className="onboarding-field font-sans">
                  <legend className="onboarding-label">Business type</legend>
                  <div className="onboarding-trade-grid" role="radiogroup" aria-label="Business type">
                    {OFFERED_TRADES.map((item) => (
                      <button
                        key={item}
                        type="button"
                        role="radio"
                        aria-checked={trade === item}
                        className={`onboarding-trade ${trade === item ? "onboarding-trade-active" : ""}`}
                        onClick={() => setTrade(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <label className="onboarding-field font-sans">
                  <span className="onboarding-label">Your mobile</span>
                  <input
                    type="tel"
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    placeholder="+1 555 123 4567"
                    className="onboarding-input"
                    autoComplete="tel"
                    inputMode="tel"
                  />
                  <span className="onboarding-hint">
                    Orvius texts job alerts here. Reply STOP to opt out ·{" "}
                    <Link href="/sms-terms">SMS Terms</Link>.
                  </span>
                </label>

                <div className="onboarding-field font-sans">
                  <label className="onboarding-label" htmlFor="onboarding-area-code">
                    Area code for your number
                  </label>
                  <div className="onboarding-area-row">
                    <input
                      id="onboarding-area-code"
                      type="text"
                      value={areaCode}
                      onChange={(e) => {
                        setAreaCodeTouched(true);
                        setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3));
                      }}
                      placeholder="512"
                      className="onboarding-input onboarding-area-input"
                      inputMode="numeric"
                      maxLength={3}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost font-sans"
                      disabled={!/^[2-9]\d{2}$/.test(areaCode) || searching}
                      onClick={() => void searchNumbers()}
                    >
                      {searching ? "Checking…" : "See numbers"}
                    </button>
                  </div>
                  {numbers && numbers.length > 0 ? (
                    <div className="onboarding-trade-grid" role="radiogroup" aria-label="Available numbers">
                      {numbers.map((item) => (
                        <button
                          key={item}
                          type="button"
                          role="radio"
                          aria-checked={pickedNumber === item}
                          className={`onboarding-trade ${pickedNumber === item ? "onboarding-trade-active" : ""}`}
                          onClick={() => setPickedNumber(item)}
                        >
                          {formatLine(item)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <span className="onboarding-hint" aria-live="polite">
                    {numbers === null
                      ? "This is the number your receptionist answers. It is on when you pay. Call it."
                      : !numbersSearchable
                        ? "We couldn't check numbers right now. We'll assign one in this area code when you create your line."
                        : numbers.length === 0
                          ? `No numbers left in ${areaCode}. Try a nearby area code, or we'll assign the closest available US number.`
                          : "If your pick is taken before you finish, we'll assign another in the same area code."}
                  </span>
                </div>
              </div>

              <DraftSaveNote state={saveState} onRetry={() => void pushDraft(currentDraft())} />

              <p className="onboarding-footnote font-sans">
                {paying ? (
                  <>
                    {plan.name} · ${planPrice}/mo{interval === "year" ? ", billed yearly" : ""} ·{" "}
                    <Link href="/pricing">Change plan</Link>. Callers hear your shop name on this number.
                  </>
                ) : (
                  "Paid subscription · verified. We assign a local number. Your receptionist answers it. Callers hear your shop name."
                )}
              </p>

              <div className="onboarding-consent font-sans">
                <label className="onboarding-check">
                  <input
                    type="checkbox"
                    checked={approvedNotice}
                    disabled={!notice}
                    onChange={(e) => setApprovedNotice(e.target.checked)}
                  />
                  <span>
                    {notice ? (
                      <>
                        Callers will hear: &ldquo;{notice.notice}&rdquo; I approve this notice, that calls are recorded, and turning
                        the line on to answer them.
                      </>
                    ) : (
                      "Enter your shop name to see the notice callers will hear."
                    )}
                  </span>
                </label>
                <label className="onboarding-check">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                  />
                  <span>
                    I agree to the{" "}
                    <Link href="/terms">Terms</Link>,{" "}
                    <Link href="/privacy">Privacy</Link>, and{" "}
                    <Link href="/refunds">Refunds</Link>.
                  </span>
                </label>
                <label className="onboarding-check">
                  <input
                    type="checkbox"
                    checked={acceptedSms}
                    onChange={(e) => setAcceptedSms(e.target.checked)}
                  />
                  <span>
                    I consent to transactional SMS alerts from {company.smsProgramName}{" "}
                    at this number.{" "}
                    <Link href="/sms-terms">SMS Terms</Link>.
                  </span>
                </label>
              </div>

              {error ? (
                <p className="onboarding-error font-sans" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="onboarding-actions">
                <button
                  type="button"
                  className="btn btn-void onboarding-btn-primary font-sans"
                  disabled={!canCreate}
                  onClick={() => void (paying ? continueToPayment() : finish())}
                >
                  {paying
                    ? submitting
                      ? "Opening checkout…"
                      : "Continue to payment"
                    : submitting
                      ? "Creating your line…"
                      : "Create my shop line"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function ProvisioningNote({
  status,
  canResume,
  busy,
  onResume,
  onRecheck,
}: {
  status: Provisioning;
  canResume: boolean;
  busy: boolean;
  onResume: () => void;
  onRecheck: () => void;
}) {
  const kept = [status.reusesNumber ? "your number" : null, status.reusesReceptionist ? "your receptionist" : null].filter(Boolean).join(" and ");
  const it = kept.includes(" and ") ? "them" : "it";
  const what =
    status.state === "outcome_unknown"
      ? `Setup stopped before it could say how far it got. ${kept ? `It already has ${kept}; resuming reuses ${it}.` : "If a number was bought, resuming finds that one first instead of buying another."}`
      : status.state === "failed_kept"
        ? `Setup didn't finish${status.error ? ` (${status.error})` : ""}. It kept ${kept}, and resuming reuses ${it}.`
        : `Setup didn't finish, and nothing was bought${status.error ? ` (${status.error})` : ""}. Resuming starts it again.`;
  return (
    <div className="onboarding-hint onboarding-provisioning font-sans" role="status" data-state={status.state}>
      <p>{what}</p>
      {canResume ? (
        <button type="button" className="btn btn-void font-sans" disabled={busy} onClick={onResume}>
          {busy ? "Resuming…" : "Resume setup"}
        </button>
      ) : (
        <>
          <p>
            We couldn&apos;t find your paid checkout yet. Payments can take a minute to show up. If checking again doesn&apos;t find it, email{" "}
            <a href={`mailto:${company.supportEmail}`}>{company.supportEmail}</a> and we&apos;ll finish it with you.
          </p>
          <button type="button" className="btn btn-ghost font-sans" onClick={onRecheck}>
            Check again
          </button>
        </>
      )}
    </div>
  );
}

function DraftSaveNote({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state.kind === "idle") return null;
  return (
    <p className="onboarding-hint onboarding-save-note font-sans" role="status" aria-live="polite" data-save={state.kind}>
      {state.kind === "saving"
        ? "Saving…"
        : state.kind === "saved"
          ? "Saved to your account. You can finish on another device."
          : state.kind === "replaced"
            ? "Showing the newer version you saved on another device."
            : (
                <>
                  Kept on this device only — {state.reason}. Payment doesn&apos;t wait on this.{" "}
                  <button type="button" className="onboarding-link-button" onClick={onRetry}>
                    Save again
                  </button>
                </>
              )}
    </p>
  );
}

function formatLine(e164: string): string {
  const digits = e164.replace(/\D/g, "").slice(-10);
  return digits.length === 10
    ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    : e164;
}
