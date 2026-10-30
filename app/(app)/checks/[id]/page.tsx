"use client";

import { Check, ChevronLeft, Info, MessageCircle, MessageSquare, Phone, PhoneCall, Siren } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { CheckLadder } from "@/components/family/check-ladder";
import { clock } from "@/components/family/format";
import { LivePill } from "@/components/family/live-pill";
import type { CheckData } from "@/components/family/types";
import { ErrorCard, LoadingCards } from "@/components/states";
import { Card, PageHeader, PillButton, SectionTitle } from "@/components/ui";
import { api } from "@/lib/api-client";
import { checkMessage, smsLink, telLink, whatsappLink } from "@/lib/safety/wellness";
import { useLive, useSnapshot } from "@/lib/use-live";

const ENDED: Record<string, string> = {
  ok: "answered “I'm okay”.",
  acknowledged: "was reached by family.",
  sos: "— this was escalated to SOS.",
  stopped: "— this check was stopped.",
};

// Caregiver view of an "Are you okay?" check: the ladder, who's checking, and quick ways to reach them.
export default function CheckPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, updatedAt, reload } = useSnapshot<CheckData>(`/api/checks/${id}`);
  const status = useLive(data ? [data.check.patient_id] : [], reload);
  const [busy, setBusy] = useState<string | null>(null);
  const [actError, setActError] = useState<string | null>(null);

  async function run(kind: string, fn: () => Promise<void>) {
    setBusy(kind);
    setActError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setActError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const ack = (value: "checking" | "reached") => run(value, async () => void (await api(`/api/checks/${id}/ack`, { method: "POST", json: { ack: value } })));
  const sos = () =>
    run("sos", async () => {
      const res = await api<{ url: string }>(`/api/checks/${id}/sos`, { method: "POST" });
      router.push(res.url);
    });

  if (error && !data) return <ErrorCard message={error} onRetry={reload} />;
  if (!data) return <LoadingCards count={3} />;

  const { check, patient, contacts, alerts } = data;
  const name = patient.name;
  const open = check.state === "asking" || check.state === "escalating";
  const myAck = alerts.find((a) => a.mine)?.ack ?? null;
  const message = checkMessage(name);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/family/${patient.id}`} className="mb-1 inline-flex min-h-12 items-center gap-1 font-bold text-ink-2">
        <ChevronLeft className="size-5" aria-hidden /> {name}
      </Link>
      <PageHeader title={`Check on ${name}`} subtitle={`Started ${clock(check.started_at)}`} right={<LivePill status={status} updatedAt={updatedAt} />} />

      <p className="mt-2 flex items-center gap-2 rounded-sm bg-surface-2 px-4 py-3 font-semibold">
        <Info className="size-5 shrink-0 text-green-700" aria-hidden /> This is a check, not an emergency.
      </p>

      {open && data.isPatient && (
        <Link href={`/okay/${id}`} className="mt-4 flex min-h-14 items-center justify-center gap-2 rounded-full bg-lime-500 text-lg font-extrabold text-ink">
          <Check className="size-5" aria-hidden /> I&apos;m okay
        </Link>
      )}

      {!open && (
        <Card className="mt-4 flex items-center gap-3 bg-ok-soft p-4 font-bold text-ok">
          <Check className="size-5 shrink-0" aria-hidden /> {name} {ENDED[check.state] ?? "— this check is closed."}
          {check.endedByName && check.state !== "ok" && ` (${check.endedByName})`}
        </Card>
      )}

      <div className="md:grid md:grid-cols-2 md:gap-6">
        <div>
          <SectionTitle>Progress</SectionTitle>
          <Card className="p-5">
            <CheckLadder data={data} />
          </Card>
        </div>

        <div>
          {open && (
            <>
              <SectionTitle>What are you doing?</SectionTitle>
              <div className="grid gap-2">
                <PillButton variant={myAck === "checking" ? "lime" : "outline"} disabled={busy !== null} onClick={() => ack("checking")}>
                  <PhoneCall className="size-5" aria-hidden /> {myAck === "checking" ? "You're checking" : "I'm checking"}
                </PillButton>
                <PillButton variant="green" disabled={busy !== null} onClick={() => ack("reached")}>
                  <Check className="size-5" aria-hidden /> I reached {name}
                </PillButton>
                {data.canManage && (
                  <PillButton variant="danger" disabled={busy !== null} onClick={sos}>
                    <Siren className="size-5" aria-hidden /> Escalate to SOS
                  </PillButton>
                )}
              </div>
              <p className="mt-2 px-1 text-sm text-ink-2">
                &ldquo;I&apos;m checking&rdquo; holds the next alert for {patient.waitMin} min. &ldquo;I reached {name}&rdquo; stops all alerts.
              </p>
              {actError && <p className="mt-3 rounded-sm bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{actError}</p>}
            </>
          )}

          <SectionTitle>Reach someone nearby</SectionTitle>
          {contacts.length === 0 ? (
            <Card className="p-5 text-ink-2">
              No emergency contacts yet.{" "}
              <Link href="/contacts" className="font-bold text-green-700 underline">
                Add one
              </Link>
            </Card>
          ) : (
            <Card className="divide-y divide-line p-0">
              {contacts.map((c) => (
                <div key={c.id} className="p-4">
                  <div className="font-bold">{c.name}</div>
                  <div className="text-sm text-ink-2 capitalize">{c.relation}</div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <a href={telLink(c.phone)} aria-label={`Call ${c.name}`} className="flex min-h-12 items-center justify-center gap-1.5 rounded-full bg-lime-500 text-sm font-bold text-ink">
                      <Phone className="size-4" aria-hidden /> Call
                    </a>
                    <a
                      href={whatsappLink(c.phone, message)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`WhatsApp ${c.name}`}
                      className="flex min-h-12 items-center justify-center gap-1.5 rounded-full border border-line text-sm font-bold"
                    >
                      <MessageCircle className="size-4" aria-hidden /> WhatsApp
                    </a>
                    <a href={smsLink(c.phone, message)} aria-label={`Text ${c.name}`} className="flex min-h-12 items-center justify-center gap-1.5 rounded-full border border-line text-sm font-bold">
                      <MessageSquare className="size-4" aria-hidden /> SMS
                    </a>
                  </div>
                </div>
              ))}
            </Card>
          )}
          <p className="mt-2 px-1 text-xs text-ink-2">Message sent: &ldquo;{message}&rdquo;</p>
        </div>
      </div>
    </div>
  );
}
