"use client";

import { CheckCircle2, ChevronLeft, Pencil, ShieldCheck, Store } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { usePrefs } from "@/components/providers";
import { RefillCard } from "@/components/refill-card";
import { DraftEditor } from "@/components/refill/draft-editor";
import { PharmacyForm } from "@/components/refill/pharmacy-form";
import { RefilledForm } from "@/components/refill/refilled-form";
import type { Channel, Pharmacy, Refill, RefillsData } from "@/components/refill/types";
import { ErrorCard, LoadingCards } from "@/components/states";
import { Card, PillButton, SectionTitle } from "@/components/ui";
import { api } from "@/lib/api-client";
import type { Lang } from "@/lib/i18n";
import { useApi } from "@/lib/use-api";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function RefillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useApi<RefillsData>(`/api/refills?id=${encodeURIComponent(id)}`);
  const refill = data?.refills[0];

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/refills" className="inline-flex min-h-12 items-center gap-1 font-bold text-green-700">
        <ChevronLeft className="size-5" aria-hidden /> Refills
      </Link>
      {loading && <LoadingCards count={2} />}
      {error && <ErrorCard message={error} onRetry={reload} />}
      {data && refill && <RefillDetail key={refill.id} refill={refill} canManage={data.canManage} patientId={data.patientId} initialPharmacy={data.pharmacy} />}
    </div>
  );
}

function RefillDetail({ refill: initial, canManage, patientId, initialPharmacy }: { refill: Refill; canManage: boolean; patientId: string; initialPharmacy: Pharmacy }) {
  const prefs = usePrefs();
  const [refill, setRefill] = useState(initial);
  const [pharmacy, setPharmacy] = useState(initialPharmacy);
  const [editPharmacy, setEditPharmacy] = useState(!initialPharmacy.phone && !initialPharmacy.email);
  const [lang, setLang] = useState<Lang>(initial.draftText ? initial.lang : prefs.lang);
  const [text, setText] = useState(initial.draftText ?? "");
  const closed = refill.state === "refilled" || refill.state === "dismissed";
  // First visit by someone who can order: write a draft straight away.
  const [drafting, setDrafting] = useState(canManage && !closed && !initial.draftText);
  const [sharing, setSharing] = useState<Channel | null>(null);
  const [saving, setSaving] = useState(false);
  const [actError, setActError] = useState<string | null>(null);

  async function fetchDraft(next: Lang) {
    try {
      const res = await api<{ text: string }>(`/api/refills/${refill.id}/draft`, { method: "POST", json: { lang: next } });
      setText(res.text);
    } catch (e) {
      setActError((e as Error).message);
    } finally {
      setDrafting(false);
    }
  }

  useEffect(() => {
    if (!drafting) return;
    api<{ text: string }>(`/api/refills/${refill.id}/draft`, { method: "POST", json: { lang } })
      .then((res) => setText(res.text))
      .catch((e: Error) => setActError(e.message))
      .finally(() => setDrafting(false));
    // Run once on open only; later drafts come from the language chips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeLang(next: Lang) {
    setLang(next);
    setDrafting(true);
    setActError(null);
    fetchDraft(next);
  }

  async function share(channel: Channel) {
    setSharing(channel);
    setActError(null);
    try {
      const res = await api<{ url: string; approvedAt: string }>(`/api/refills/${refill.id}/approve`, { method: "POST", json: { text, channel } });
      setRefill((r) => ({ ...r, state: "approved", approvedBy: { name: "You", at: res.approvedAt } }));
      // Opens the person's own app with the message filled in. They press send there.
      if (!window.open(res.url, "_blank")) window.location.href = res.url;
    } catch (e) {
      setActError((e as Error).message);
    } finally {
      setSharing(null);
    }
  }

  async function refilled(quantity: number) {
    setSaving(true);
    setActError(null);
    try {
      const res = await api<{ stock: number }>(`/api/refills/${refill.id}/refilled`, { method: "POST", json: { quantity } });
      setRefill((r) => ({ ...r, state: "refilled", stock: res.stock, refilled: { name: "You", qty: quantity, at: new Date().toISOString() } }));
    } catch (e) {
      setActError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <RefillCard name={refill.medicine.name} strength={refill.medicine.strength} daysLeft={refill.daysLeft} state={refill.state} generic={refill.generic} approvedByName={refill.approvedBy?.name} />
      <p className="px-1 text-sm text-ink-2">
        {refill.stock} left · {refill.dosesPerDay} a day as scheduled · suggested order {refill.quantity} (30 days)
      </p>
      {actError && <p className="rounded-sm bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{actError}</p>}

      {refill.refilled && (
        <Card className="flex items-center gap-3 p-4">
          <CheckCircle2 className="size-6 shrink-0 text-ok" aria-hidden />
          <div>
            <div className="font-bold">Added {refill.refilled.qty} to stock</div>
            <div className="text-sm text-ink-2">
              Recorded by {refill.refilled.name}, {when(refill.refilled.at)}
            </div>
          </div>
        </Card>
      )}

      {!closed && (
        <>
          <SectionTitle
            action={
              canManage &&
              !editPharmacy && (
                <PillButton size="sm" variant="ghost" onClick={() => setEditPharmacy(true)}>
                  <Pencil className="size-4" aria-hidden /> Pharmacy
                </PillButton>
              )
            }
          >
            Order message
          </SectionTitle>

          {canManage && editPharmacy ? (
            <PharmacyForm
              patientId={patientId}
              initial={pharmacy}
              onSaved={(p) => {
                setPharmacy(p);
                setEditPharmacy(false);
              }}
            />
          ) : (
            <p className="flex items-center gap-2 px-1 text-sm text-ink-2">
              <Store className="size-4" aria-hidden /> To: {pharmacy.name || "your pharmacy"}
              {pharmacy.phone && ` · ${pharmacy.phone}`}
              {pharmacy.email && ` · ${pharmacy.email}`}
            </p>
          )}

          <Card className="p-4">
            <DraftEditor
              text={text}
              onText={setText}
              lang={lang}
              onLang={changeLang}
              drafting={drafting}
              onShare={share}
              sharing={sharing}
              canPhone={Boolean(pharmacy.phone)}
              canEmail={Boolean(pharmacy.email)}
              readOnly={!canManage}
            />
          </Card>

          {refill.approvedBy && (
            <p className="flex items-center gap-2 px-1 text-sm text-ink-2">
              <ShieldCheck className="size-4 text-ok" aria-hidden /> Approved by {refill.approvedBy.name}, {when(refill.approvedBy.at)}
            </p>
          )}

          {canManage && (
            <>
              <SectionTitle>Got the medicine?</SectionTitle>
              <RefilledForm form={refill.medicine.form} busy={saving} onSubmit={refilled} />
            </>
          )}
        </>
      )}
      {!canManage && <p className="px-1 text-sm text-ink-2">You can view this refill. Only the patient or a caregiver can order or change it.</p>}
    </div>
  );
}
