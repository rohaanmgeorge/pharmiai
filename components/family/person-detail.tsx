"use client";

import { HeartPulse, Phone, Settings2, Siren, SquarePen } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { AdherenceBars, DoseCard, type DoseView } from "@/components/cards";
import { ErrorCard, LoadingCards } from "@/components/states";
import { Avatar, Card, PillButton, SectionTitle } from "@/components/ui";
import { telLink } from "@/lib/safety/wellness";
import { useLive, useSnapshot } from "@/lib/use-live";
import { ago, clock, colorFor, PRESENCE_LABEL } from "./format";
import { LivePill } from "./live-pill";
import { Timeline } from "./timeline";
import type { AdherenceData, PersonDetail as Detail } from "./types";

type TodayData = { doses: DoseView[] };

/** One person's live view: today's doses (read-only), weekly bars, alert timeline, call button. */
export function PersonDetail({ patientId, showLive = true }: { patientId: string; showLive?: boolean }) {
  const detail = useSnapshot<Detail>(`/api/dashboard?patient=${encodeURIComponent(patientId)}`);
  const today = useSnapshot<TodayData>(`/api/today?patient=${encodeURIComponent(patientId)}`);
  const week = useSnapshot<AdherenceData>(`/api/adherence?patient=${encodeURIComponent(patientId)}`);
  const { reload: r1 } = detail;
  const { reload: r2 } = today;
  const { reload: r3 } = week;
  const reloadAll = useCallback(() => {
    r1();
    r2();
    r3();
  }, [r1, r2, r3]);
  const status = useLive([patientId], reloadAll);

  if (detail.error && !detail.data) return <ErrorCard message={detail.error} onRetry={reloadAll} />;
  if (!detail.data) return <LoadingCards count={3} />;

  const { person, contacts, timeline } = detail.data;
  const first = contacts[0];
  const isSelf = person.role === "self";

  return (
    <div>
      <div className="flex items-center gap-4">
        <Avatar name={person.name} color={colorFor(person.id)} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-extrabold">{isSelf ? `${person.name} (you)` : person.name}</h1>
          <p className="text-ink-2">
            {isSelf ? "Your medicines" : person.role === "caregiver" ? "You are a caregiver" : "You can view"} · {PRESENCE_LABEL[person.presence] ?? person.presence} · active{" "}
            {ago(person.lastActivityAt)}
          </p>
        </div>
        {showLive && <LivePill status={status} updatedAt={detail.updatedAt} />}
      </div>

      {(person.sos || person.check) && (
        <Card className="mt-4 overflow-hidden p-0 ring-4 ring-danger">
          {person.sos ? (
            <Link href={`/sos?patient=${person.id}`} className="flex min-h-14 items-center gap-2 bg-danger px-4 font-bold text-white">
              <Siren className="size-5" aria-hidden /> SOS active since {clock(person.sos.startedAt)}
            </Link>
          ) : (
            person.check && (
              <Link href={`/checks/${person.check.id}`} className="flex min-h-14 items-center gap-2 bg-danger-soft px-4 font-bold text-danger">
                <HeartPulse className="size-5" aria-hidden /> {person.name} hasn&apos;t answered &ldquo;Are you okay?&rdquo; — open the check
              </Link>
            )
          )}
        </Card>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {first && !isSelf && (
          <a href={telLink(first.phone)}>
            <PillButton size="md" variant="lime" tabIndex={-1}>
              <Phone className="size-4" aria-hidden /> Call {first.name}
            </PillButton>
          </a>
        )}
        {person.canManage && (
          <>
            <Link href={isSelf ? "/today" : `/today?patient=${person.id}`}>
              <PillButton size="md" tabIndex={-1}>
                <SquarePen className="size-4" aria-hidden /> Mark doses
              </PillButton>
            </Link>
            <Link href={isSelf ? "/settings/care" : `/settings/care?patient=${person.id}`}>
              <PillButton size="md" variant="ghost" tabIndex={-1}>
                <Settings2 className="size-4" aria-hidden /> Care settings
              </PillButton>
            </Link>
          </>
        )}
      </div>
      {!first && !isSelf && <p className="mt-2 text-sm text-ink-2">No emergency contact with a phone number yet.</p>}

      <div className="lg:grid lg:grid-cols-2 lg:gap-6">
        <div>
          <SectionTitle>Today</SectionTitle>
          {today.error && <ErrorCard message={today.error} onRetry={today.reload} />}
          {!today.data && !today.error && <LoadingCards count={2} />}
          {today.data && today.data.doses.length === 0 && <Card className="p-5 text-ink-2">No doses scheduled today.</Card>}
          <div className="space-y-3">
            {today.data?.doses.map((d) => (
              <DoseCard key={d.id} dose={d} compact />
            ))}
          </div>
        </div>
        <div>
          <SectionTitle>Adherence</SectionTitle>
          {week.data ? <AdherenceBars days={week.data.days} /> : week.error ? <ErrorCard message={week.error} onRetry={week.reload} /> : <LoadingCards count={1} />}
          <SectionTitle>Alerts</SectionTitle>
          <Timeline events={timeline} />
        </div>
      </div>
    </div>
  );
}
