"use client";

import { useCallback, useEffect, useState } from "react";
import { RecordAvatar } from "@/components/record-avatar";
import { toast } from "@/components/toaster";
import { MEMBER_ROLES, ROLE_DETAILS, ROLE_LABELS, type MemberRole, type ShopRole } from "@/lib/workspace-access-labels";
import { ScGroup, ScRow } from "./settings-primitives";

type Person = {
  id: string | null;
  email: string;
  role: ShopRole;
  lastSeenAt: string | null;
  you: boolean;
};

function lastActive(person: Person) {
  if (person.role === "owner") return ROLE_DETAILS.owner;
  if (!person.lastSeenAt) return "Hasn't signed in yet";
  const minutes = Math.round((Date.now() - new Date(person.lastSeenAt).getTime()) / 60_000);
  if (minutes < 5) return "Active now";
  if (minutes < 60) return `Active ${minutes} min ago`;
  if (minutes < 60 * 24) return `Active ${Math.round(minutes / 60)} h ago`;
  return `Active ${new Date(person.lastSeenAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function TeamAccessGroup() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("dispatcher");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/team", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) {
      setPeople([]);
      return;
    }
    const data = (await res.json()) as { people: Person[]; canManage: boolean };
    setPeople(data.people);
    setCanManage(data.canManage);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; emailed?: boolean; signInUrl?: string };
      if (!res.ok) {
        setMessage({ error: true, text: data.error ?? "Couldn't add them. Try again." });
        return;
      }
      const added = email.trim().toLowerCase();
      setEmail("");
      setMessage({
        error: false,
        text: data.emailed
          ? `Emailed ${added}. They sign in with that address.`
          : `${added} can sign in now at ${data.signInUrl} with that email address. Send them the link.`,
      });
      toast({ title: `${ROLE_LABELS[role]} access given to ${added}` });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(person: Person, next: MemberRole) {
    const res = await fetch("/api/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: person.id, role: next }),
    }).catch(() => null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
      toast({ title: data?.error ?? "Couldn't change the role.", tone: "error" });
      return;
    }
    toast({ title: `${person.email} is now ${ROLE_LABELS[next]}` });
    await load();
  }

  async function remove(person: Person) {
    const verb = person.you ? "Leave this shop?" : `Remove ${person.email}? They lose access right away.`;
    if (!window.confirm(verb)) return;
    const res = await fetch(`/api/team?id=${encodeURIComponent(person.id ?? "")}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
      toast({ title: data?.error ?? "Couldn't remove them.", tone: "error" });
      return;
    }
    if (person.you) {
      window.location.assign("/dashboard");
      return;
    }
    toast({ title: `${person.email} no longer has access` });
    await load();
  }

  return (
    <ScGroup title={people ? `People with access · ${people.length}` : "People with access"}>
      {people === null ? (
        <p className="sc-muted sc-pad">Loading…</p>
      ) : (
        people.map((person) => (
          <div key={person.id ?? person.email} className="sc-row sc-person">
            <RecordAvatar name={person.email} />
            <div className="sc-row-copy">
              <p className="sc-row-label">
                {person.email}
                {person.you ? <span className="sc-muted"> · you</span> : null}
              </p>
              <p className="sc-row-hint">{lastActive(person)}</p>
            </div>
            <div className="sc-row-control">
              {person.role === "owner" || !canManage || person.you ? (
                <span className="sc-value">{ROLE_LABELS[person.role]}</span>
              ) : (
                <select
                  className="sc-input sc-team-role"
                  aria-label={`Role for ${person.email}`}
                  value={person.role}
                  onChange={(e) => void changeRole(person, e.target.value as MemberRole)}
                >
                  {MEMBER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              )}
              {person.role !== "owner" && (canManage || person.you) ? (
                <button type="button" className="sc-btn" onClick={() => void remove(person)}>
                  {person.you ? "Leave" : "Remove"}
                </button>
              ) : null}
            </div>
          </div>
        ))
      )}
      {canManage ? (
        <ScRow stack label="Give someone access" hint={ROLE_DETAILS[role]}>
          <form
            className="sc-inline-field"
            onSubmit={(e) => {
              e.preventDefault();
              void invite();
            }}
          >
            <input
              className="sc-input"
              type="email"
              aria-label="Teammate email"
              placeholder="dispatch@yourshop.com"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <select
              className="sc-input sc-team-role"
              aria-label="Role"
              value={role}
              onChange={(e) => setRole(e.target.value as MemberRole)}
            >
              {MEMBER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <button type="submit" className="sc-btn sc-btn--primary" disabled={busy || email.trim().length < 5}>
              {busy ? "Adding…" : "Add"}
            </button>
          </form>
        </ScRow>
      ) : null}
      {message ? (
        <p className={message.error ? "sc-banner sc-banner--error" : "sc-banner"} role="status">
          {message.text}
        </p>
      ) : null}
    </ScGroup>
  );
}
