"use client";

import { CalendarClock, CircleHelp, Eye, Info, Layers, ScanLine } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ErrorCard, LoadingCards } from "@/components/states";
import { ExpiryBadge, type ExpiryBadgeKind } from "@/components/strips/expiry-badge";
import { StripConfirmForm } from "@/components/strips/strip-confirm-form";
import { type GenericOffer, type MatchingSchedule, type MedicineInfo, StripResult } from "@/components/strips/strip-result";
import { AiHeadline, Card, cn, PillButton, StatusBadge } from "@/components/ui";
import type { Status } from "@/lib/mock";
import type { StripReading } from "@/lib/safety/strip";
import { patientQuery, useApi } from "@/lib/use-api";

type StripDetail = {
  strip: {
    id: string;
    patient_id: string;
    reading_a: StripReading | null;
    reading_b: StripReading | null;
    catalog_id: string | null;
    candidates: { id: string; name: string; strength: string; ingredients: string[] }[];
    status: Status;
    reasons: string[];
    expiry_read: string | null;
    batch: string | null;
    state: string;
    photoUrl: string | null;
    expiry: string | null;
    expiryReadLabel: string | null;
    badge: ExpiryBadgeKind;
    name: string | null;
  };
  matching: MatchingSchedule[];
  duplicates: { ingredient: string; names: string[] }[];
  info: MedicineInfo | null;
  generic: GenericOffer | null;
  canManage: boolean;
};

function ReadingBox({ label, icon, r, differs }: { label: string; icon: React.ReactNode; r: StripReading | null; differs: boolean }) {
  const row = (name: string, v: string | null | undefined) => (
    <div>
      <span className="text-ink-2">{name}: </span>
      <span className="font-semibold">{v ?? "[unreadable]"}</span>
    </div>
  );
  return (
    <div className={cn("rounded-sm bg-surface-2 p-3 text-sm", differs && "ring-2 ring-warn")}>
      <div className="mb-1 flex items-center gap-1 text-xs font-bold text-ink-2">
        {icon} {label}
      </div>
      {r ? (
        <>
          {row("Name", r.brand)}
          {row("Strength", r.strength)}
          {row("Expiry", r.expiry)}
          {row("Batch", r.batch)}
        </>
      ) : (
        <div className="font-semibold">This reading failed.</div>
      )}
    </div>
  );
}

export default function StripReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [query] = useState(patientQuery);
  const { data, error, loading, reload } = useApi<StripDetail>(`/api/strips/${id}`);

  if (loading) return <div className="mx-auto max-w-xl pt-10"><LoadingCards /></div>;
  if (error || !data) return <div className="mx-auto max-w-xl pt-10"><ErrorCard message={error ?? "Could not load"} onRetry={reload} /></div>;

  const { strip } = data;
  const a = strip.reading_a;
  const b = strip.reading_b;
  const differs = JSON.stringify(a) !== JSON.stringify(b);
  const title = strip.name ?? (strip.status === "not_recognized" ? "Unclear medicine" : (a?.brand ?? b?.brand ?? "Unclear medicine"));
  const photo = strip.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={strip.photoUrl} alt="Your medicine strip photo" className="max-h-72 w-full rounded-card bg-white object-contain shadow-card" />
  ) : null;
  const expiryLink = `/expiry${query || `?patient=${strip.patient_id}`}`;

  return (
    <div className="mx-auto max-w-xl space-y-4 pt-6 pb-8">
      <AiHeadline sub="We read the strip twice. Please check it against the real strip.">
        {strip.status === "verified" ? `Checked: ${title}` : strip.status === "not_recognized" ? "I couldn't recognise this medicine." : `Is this ${title}?`}
      </AiHeadline>

      {photo}

      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 truncate text-lg font-bold">{title}</div>
          <StatusBadge status={strip.status} layoutId={`strip-${strip.id}`} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ReadingBox label="Reading 1" icon={<Eye className="size-3.5" aria-hidden />} r={a} differs={false} />
          <ReadingBox label="Reading 2" icon={<Layers className="size-3.5" aria-hidden />} r={b} differs={differs} />
        </div>
        {strip.status !== "verified" && strip.reasons.length > 0 && (
          <ul className="space-y-1 text-sm text-ink-2">
            {strip.reasons.map((r) => (
              <li key={r} className="flex items-start gap-2">
                <CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden /> {r}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {strip.status === "not_recognized" && (
        <p className="rounded-sm bg-surface-2 p-3 text-sm">
          This medicine is not in our checked list, so we won&apos;t explain it or track its expiry. Please show the strip to your pharmacist.
        </p>
      )}

      {strip.status === "needs_check" && !strip.catalog_id && (
        <p className="rounded-sm bg-surface-2 p-3 text-sm">
          The two readings did not agree on one medicine, so this can&apos;t be verified. Try a clearer, flatter photo of the printed name — or ask your pharmacist.
        </p>
      )}

      {strip.status === "needs_check" && strip.catalog_id && data.canManage && (
        <Card className="p-4">
          <StripConfirmForm
            stripId={strip.id}
            catalogId={strip.catalog_id}
            candidates={strip.candidates}
            expiryRead={strip.expiry_read}
            expiryReadLabel={strip.expiryReadLabel}
            batch={strip.batch}
            matching={data.matching}
            photo={photo}
            onDone={reload}
          />
        </Card>
      )}

      {strip.status === "verified" && strip.name && (
        <StripResult
          name={strip.name}
          expiry={strip.expiry}
          badge={strip.badge}
          matching={data.matching}
          duplicates={data.duplicates}
          info={data.info}
          generic={data.generic}
        />
      )}

      {strip.status !== "verified" && (
        <div className="flex items-center gap-2 text-sm text-ink-2">
          <ExpiryBadge badge="needs_check" /> No expiry is saved until a person confirms it.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Link href={expiryLink}>
          <PillButton className="w-full">
            <CalendarClock className="size-5" aria-hidden /> Expiry list
          </PillButton>
        </Link>
        <Link href={`/scan?mode=medicine${query ? `&${query.slice(1)}` : ""}`}>
          <PillButton className="w-full">
            <ScanLine className="size-5" aria-hidden /> Scan another
          </PillButton>
        </Link>
      </div>

      <p className="flex items-start gap-2 text-xs text-ink-2">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> We read the printed strip only. We never identify loose tablets by look.
      </p>
    </div>
  );
}
