"use client";

import { Check, Clock, Phone } from "lucide-react";
import { cn } from "@/components/ui";
import { clock } from "./format";
import type { CheckAlert, CheckData } from "./types";

function AckChip({ alert }: { alert: CheckAlert }) {
  if (!alert.ack) return <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold text-ink-2">Alerted {clock(alert.sent_at)}</span>;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold", alert.ack === "reached" ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>
      {alert.ack === "reached" ? <Check className="size-3.5" aria-hidden /> : <Phone className="size-3.5" aria-hidden />}
      {alert.ack === "reached" ? "Reached ✓" : "I'm checking"}
    </span>
  );
}

/** Asked → Family → Contacts. Each step shows who was alerted and their answer. */
export function CheckLadder({ data }: { data: CheckData }) {
  const { check, alerts, contacts, patient } = data;
  const family = alerts.filter((a) => a.member_id);
  const linkAlerts = alerts.filter((a) => a.contact_id);
  const contactName = (id: string | null) => contacts.find((c) => c.id === id)?.name ?? "Emergency contact";

  const steps = [
    {
      title: `Asked ${patient.name} "Are you okay?"`,
      at: check.started_at,
      reached: true,
      body: null as React.ReactNode,
    },
    {
      title: "Family alerted",
      at: family.find((a) => a.level === 1)?.sent_at ?? null,
      reached: check.level >= 1 || family.length > 0,
      body: family.length > 0 && (
        <ul className="mt-2 space-y-2">
          {family.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="font-semibold">
                {a.memberName}
                {a.mine && " (you)"}
              </span>
              <AckChip alert={a} />
            </li>
          ))}
        </ul>
      ),
    },
    {
      title: "Emergency contacts alerted",
      at: linkAlerts[0]?.sent_at ?? null,
      reached: check.level >= 2,
      body: linkAlerts.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {linkAlerts.map((a) => (
            <li key={a.id}>{contactName(a.contact_id)} — please send them the message below</li>
          ))}
        </ul>
      ),
    },
  ];

  return (
    <ol className="relative space-y-5">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", s.reached ? "bg-green-700 text-white" : "bg-surface-2 text-ink-2")}>
              {s.reached ? <Check className="size-4" aria-hidden /> : <Clock className="size-4" aria-hidden />}
            </span>
            {i < steps.length - 1 && <span className={cn("mt-1 w-0.5 flex-1", s.reached ? "bg-green-700" : "bg-line")} aria-hidden />}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <div className={cn("font-bold", !s.reached && "text-ink-2")}>{s.title}</div>
            <div className="text-xs font-bold text-ink-2">{s.at ? clock(s.at) : s.reached ? "" : `Next, if no answer within ${patient.waitMin} min`}</div>
            {s.body}
          </div>
        </li>
      ))}
    </ol>
  );
}
