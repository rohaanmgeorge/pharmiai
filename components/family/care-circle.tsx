"use client";

import { Check, Clock, LogOut, Mail, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { Avatar, Card, cn, ConsentChip, PillButton, SectionTitle } from "@/components/ui";
import { ErrorCard, LoadingCards } from "@/components/states";
import { api } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { colorFor } from "./format";
import type { CircleData, CircleLink } from "./types";

const LANG = { en: "English", ml: "മലയാളം", hi: "हिन्दी" } as Record<string, string>;
const ROLE_HELP = {
  caregiver: "Caregiver: can see and manage medicines (mark doses, scan, refill).",
  viewer: "Viewer: can only see medicines and alerts.",
};

function InviteForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"caregiver" | "viewer">("caregiver");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api("/api/circle", { method: "POST", json: { email, role } });
      setMessage({ ok: true, text: "Added. Now tap “Allow access” below so they can see your medicines." });
      setEmail("");
      onDone();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <form onSubmit={send} className="space-y-4">
        <ol className="flex flex-wrap gap-2 text-sm font-bold">
          <li className="rounded-full bg-lime-300 px-3 py-1 text-ink">1. Invite by email</li>
          <li className="rounded-full bg-surface-2 px-3 py-1 text-ink-2">2. Allow access</li>
        </ol>
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-ink-2">Their PharmiAI email</span>
          <span className="flex min-h-12 items-center gap-2 rounded-input bg-surface-2 px-4">
            <Mail className="size-4 text-ink-2" aria-hidden />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              autoComplete="email"
              className="min-h-12 flex-1 bg-transparent outline-none"
            />
          </span>
        </label>
        <fieldset>
          <legend className="mb-1 text-sm font-bold text-ink-2">What can they do?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["caregiver", "viewer"] as const).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={role === r}
                onClick={() => setRole(r)}
                className={cn("min-h-12 rounded-sm border p-3 text-left text-sm", role === r ? "border-green-700 bg-ok-soft" : "border-line bg-surface")}
              >
                {ROLE_HELP[r]}
              </button>
            ))}
          </div>
        </fieldset>
        <PillButton type="submit" variant="green" disabled={busy || !email} className="w-full">
          <UserPlus className="size-4" aria-hidden /> {busy ? "Inviting…" : "Invite"}
        </PillButton>
        {message && (
          <p role="status" className={cn("rounded-sm px-4 py-3 text-sm font-semibold", message.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger")}>
            {message.text}
          </p>
        )}
      </form>
    </Card>
  );
}

function MemberRow({ link, onChange }: { link: CircleLink; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const setConsent = (consent: "given" | "revoked") => run(() => api(`/api/circle/${link.id}`, { method: "PATCH", json: { consent } }));
  const remove = () => run(() => api(`/api/circle/${link.id}`, { method: "DELETE" }));

  return (
    <div className="p-4">
      <div className="flex items-center gap-3">
        <Avatar name={link.person.name} color={colorFor(link.person.id)} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{link.person.name}</div>
          <div className="text-sm text-ink-2">
            <span className="capitalize">{link.role}</span> · {LANG[link.person.lang] ?? link.person.lang}
          </div>
        </div>
        <ConsentChip consent={link.consent} />
      </div>
      {link.consent === "pending" && <p className="mt-2 text-sm text-ink-2">{link.person.name} can&apos;t see anything until you allow access.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {link.consent !== "given" ? (
          <PillButton size="sm" variant="green" disabled={busy} onClick={() => setConsent("given")}>
            <ShieldCheck className="size-4" aria-hidden /> Allow access
          </PillButton>
        ) : (
          <PillButton size="sm" disabled={busy} onClick={() => setConsent("revoked")}>
            <X className="size-4" aria-hidden /> Revoke access
          </PillButton>
        )}
        <PillButton size="sm" variant="ghost" disabled={busy} onClick={remove}>
          <Trash2 className="size-4" aria-hidden /> Remove
        </PillButton>
      </div>
      {error && <p className="mt-2 rounded-sm bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}

function CaringForRow({ link, onChange }: { link: CircleLink; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const name = link.person.name;
  const text = {
    pending: `${name} added you as ${link.role}. Waiting for ${name} to allow access.`,
    given: `You are ${name}'s ${link.role}.`,
    revoked: `${name} turned off your access.`,
  }[link.consent];
  async function leave() {
    setBusy(true);
    await api(`/api/circle/${link.id}`, { method: "DELETE" }).catch(() => {});
    setBusy(false);
    onChange();
  }
  return (
    <div className="flex items-center gap-3 p-4">
      <Avatar name={name} color={colorFor(link.person.id)} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold">{name}</div>
        <div className="flex items-center gap-1 text-sm text-ink-2">
          {link.consent === "pending" ? <Clock className="size-3.5 shrink-0" aria-hidden /> : link.consent === "given" ? <Check className="size-3.5 shrink-0" aria-hidden /> : null}
          {text}
        </div>
      </div>
      <PillButton size="sm" variant="ghost" disabled={busy} onClick={leave} aria-label={`Leave ${name}'s care circle`}>
        <LogOut className="size-4" aria-hidden /> Leave
      </PillButton>
    </div>
  );
}

/** The care circle: who may see MY medicines (invite → allow), and whose circles I'm in. */
export function CareCircle({ onChange }: { onChange?: () => void }) {
  const { data, error, loading, reload } = useApi<CircleData>("/api/circle");
  const [inviting, setInviting] = useState(false);
  const changed = () => {
    reload();
    onChange?.();
  };

  return (
    <section>
      <SectionTitle
        action={
          <PillButton size="sm" variant="lime" onClick={() => setInviting(!inviting)} aria-expanded={inviting}>
            <UserPlus className="size-4" aria-hidden /> {inviting ? "Close" : "Invite"}
          </PillButton>
        }
      >
        Your care circle
      </SectionTitle>
      <p className="mb-3 px-1 text-sm text-ink-2">
        Family who can see your medicines. Two steps: invite them, then tap <strong>Allow access</strong>. You can revoke any time.
      </p>
      {inviting && (
        <div className="mb-3">
          <InviteForm onDone={changed} />
        </div>
      )}
      {loading && <LoadingCards count={1} />}
      {error && <ErrorCard message={error} onRetry={reload} />}
      {data && data.members.length === 0 && !inviting && <Card className="p-5 text-ink-2">No one yet. Tap Invite to add a family member.</Card>}
      {data && data.members.length > 0 && (
        <Card className="divide-y divide-line p-0">
          {data.members.map((m) => (
            <MemberRow key={m.id} link={m} onChange={changed} />
          ))}
        </Card>
      )}
      <p className="mt-2 px-1 text-sm text-ink-2">
        {ROLE_HELP.caregiver} {ROLE_HELP.viewer}
      </p>

      {data && data.caringFor.length > 0 && (
        <>
          <SectionTitle>Circles you are in</SectionTitle>
          <Card className="divide-y divide-line p-0">
            {data.caringFor.map((l) => (
              <CaringForRow key={l.id} link={l} onChange={changed} />
            ))}
          </Card>
        </>
      )}
    </section>
  );
}
