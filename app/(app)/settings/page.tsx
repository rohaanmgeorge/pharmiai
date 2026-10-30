"use client";

import { BellRing, ChevronRight, Lock, LogOut, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CardSettings } from "@/components/emergency/card-settings";
import { usePrefs } from "@/components/providers";
import { ErrorCard, LoadingCards } from "@/components/states";
import { Card, cn, PageHeader, PillButton, SectionTitle, Toggle } from "@/components/ui";
import { api, enablePush, pushState, type PushState } from "@/lib/api-client";
import { LANGS, type Lang } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useApi } from "@/lib/use-api";

type Profile = { name: string; lang: Lang; blood_group: string | null; allergies: string[]; conditions: string[] };
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const field = "min-h-12 w-full rounded-sm border border-line bg-surface px-4 text-base outline-none focus:border-green-700";

function Row({ title, body, children }: { title: string; body?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 p-4">
      <div className="min-w-0 flex-1">
        <div className="font-bold">{title}</div>
        {body && <div className="text-sm text-ink-2">{body}</div>}
      </div>
      {children}
    </div>
  );
}

function ProfileForm({ profile }: { profile: Profile }) {
  const [name, setName] = useState(profile.name);
  const [blood, setBlood] = useState(profile.blood_group ?? "");
  const [allergies, setAllergies] = useState(profile.allergies.join(", "));
  const [conditions, setConditions] = useState(profile.conditions.join(", "));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      await api("/api/profile", { method: "PATCH", json: { name, bloodGroup: blood, allergies, conditions } });
      setNote({ ok: true, text: "Saved" });
    } catch (err) {
      setNote({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <form onSubmit={save} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-ink-2">Name</span>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-ink-2">Blood group</span>
          <select className={field} value={blood} onChange={(e) => setBlood(e.target.value)}>
            <option value="">Not set</option>
            {BLOOD_GROUPS.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-ink-2">Allergies (separate with commas)</span>
          <input className={field} value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="e.g. Penicillin, Sulfa" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-ink-2">Conditions (separate with commas)</span>
          <input className={field} value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="e.g. Diabetes, High BP" />
        </label>
        <div className="flex items-center gap-3">
          <PillButton type="submit" variant="green" disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
          </PillButton>
          {note && <span className={cn("text-sm font-semibold", note.ok ? "text-ok" : "text-danger")}>{note.text}</span>}
        </div>
      </form>
    </Card>
  );
}

function PushRow() {
  const [state, setState] = useState<PushState | null>(null);
  useEffect(() => {
    pushState().then(setState);
  }, []);
  const body =
    state === "on"
      ? "On for this device. Dose reminders and SOS alerts arrive here."
      : state === "denied"
        ? "Blocked. Allow notifications for this site in your browser settings."
        : state === "unsupported"
          ? "On iPhone, add PharmiAI to your Home Screen first."
          : "Off for this device.";
  return (
    <Row title="Notifications" body={body}>
      {state === "off" ? (
        <PillButton size="sm" variant="green" className="min-h-12" onClick={async () => setState(await enablePush().catch(() => "off" as const))}>
          <BellRing className="size-4" aria-hidden /> Turn on
        </PillButton>
      ) : (
        <span className={cn("rounded-full px-3 py-1 text-xs font-bold", state === "on" ? "bg-ok-soft text-ok" : "bg-surface-2 text-ink-2")}>{state === "on" ? "On" : "Off"}</span>
      )}
    </Row>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { lang, setLang, elder, setElder, t } = usePrefs();
  const { data, error, loading, reload } = useApi<{ me: Profile | null }>("/api/me");
  const [langError, setLangError] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Language: change this device right away, and save it to the profile so
  // reminders and family messages use it too.
  async function chooseLang(next: Lang) {
    setLang(next);
    setLangError(null);
    await api("/api/profile", { method: "PATCH", json: { lang: next } }).catch((e: Error) => setLangError(e.message));
  }

  async function logOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
  }

  async function deleteEverything() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api("/api/account/delete", { method: "POST" });
      await supabaseBrowser().auth.signOut().catch(() => {});
      router.replace("/login");
    } catch (e) {
      setDeleteError((e as Error).message);
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" />

      <SectionTitle>Language</SectionTitle>
      <Card className="grid grid-cols-3 gap-2 p-2">
        {LANGS.map((l) => (
          <button
            key={l.code}
            onClick={() => chooseLang(l.code)}
            aria-pressed={lang === l.code}
            className={cn("min-h-14 rounded-full text-lg font-bold transition-colors", lang === l.code ? "bg-lime-500 text-ink" : "text-ink-2 hover:bg-surface-2")}
          >
            {l.label}
          </button>
        ))}
      </Card>
      {langError && <p className="mt-2 px-1 text-sm font-semibold text-danger">{langError}</p>}

      <SectionTitle>Profile</SectionTitle>
      {loading && <LoadingCards count={1} />}
      {error && <ErrorCard message={error} onRetry={reload} />}
      {data?.me && <ProfileForm profile={data.me} />}

      <SectionTitle>Accessibility</SectionTitle>
      <Card className="divide-y divide-line p-0">
        <Row title="Elder mode" body="Bigger text and buttons, fewer animations (this device)">
          <Toggle checked={elder} onChange={setElder} label="Elder mode" />
        </Row>
      </Card>

      <SectionTitle>Notifications</SectionTitle>
      <Card className="p-0">
        <PushRow />
      </Card>

      <SectionTitle>Emergency</SectionTitle>
      <CardSettings />
      <Card className="mt-3 divide-y divide-line p-0">
        <Link href="/contacts" className="flex min-h-14 items-center gap-3 p-4 font-bold">
          <span className="flex-1">Emergency contacts</span>
          <ChevronRight className="size-5 text-ink-2" aria-hidden />
        </Link>
        <Link href="/settings/care" className="flex min-h-14 items-center gap-3 p-4 font-bold">
          <Users className="size-5 text-green-700" aria-hidden />
          <span className="flex-1">Care settings (refills, checks, quiet hours)</span>
          <ChevronRight className="size-5 text-ink-2" aria-hidden />
        </Link>
      </Card>

      <SectionTitle>Privacy</SectionTitle>
      <Card className="divide-y divide-line p-0">
        <Row title="Your data stays private" body="Prescription photos are private. Family sees them only with your consent.">
          <Lock className="size-5 text-green-700" aria-hidden />
        </Row>
        <div className="flex flex-wrap gap-2 p-4">
          <PillButton size="sm" className="min-h-12" onClick={logOut}>
            <LogOut className="size-4" aria-hidden /> Log out
          </PillButton>
          {deleteStep === 0 && (
            <PillButton size="sm" className="min-h-12 text-danger" onClick={() => setDeleteStep(1)}>
              <Trash2 className="size-4" aria-hidden /> Delete my data
            </PillButton>
          )}
        </div>
        {deleteStep > 0 && (
          <div className="space-y-3 p-4">
            <p className="font-bold">
              {deleteStep === 1
                ? "This deletes your account, prescriptions, photos, reminders, contacts and care circle. It cannot be undone."
                : "Last check: delete everything now?"}
            </p>
            <div className="flex flex-wrap gap-2">
              <PillButton size="sm" className="min-h-12" disabled={deleting} onClick={() => setDeleteStep(0)}>
                Keep my data
              </PillButton>
              <PillButton size="sm" variant="danger" className="min-h-12" disabled={deleting} onClick={() => (deleteStep === 1 ? setDeleteStep(2) : deleteEverything())}>
                <Trash2 className="size-4" aria-hidden /> {deleting ? "Deleting…" : deleteStep === 1 ? "Continue" : "Yes, delete everything"}
              </PillButton>
            </div>
            {deleteError && <p className="rounded-sm bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{deleteError}</p>}
          </div>
        )}
      </Card>

      <p className="mt-8 text-center text-sm text-ink-2">{t("disclaimer")}</p>
      <p className="mt-1 text-center text-xs text-ink-2">PharmiAI · hackathon prototype</p>
    </div>
  );
}
