"use client";

import { Droplet, HeartPulse, Phone, Pill, Share2, TriangleAlert } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useClientValue } from "@/lib/client";
import { Card, DemoTag, PillButton } from "@/components/ui";
import { contacts, medicines, patient } from "@/lib/mock";

// Public, read-only Emergency Medical Card (opened from the share link or lock-screen QR).
export function EmergencyCardClient() {
  const url = useClientValue(() => window.location.href, "");

  return (
    <main className="mx-auto max-w-md px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-10">
      <div className="mb-4 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 rounded-full bg-danger px-4 py-2 text-sm font-extrabold text-white">
          <HeartPulse className="size-4" aria-hidden /> Emergency Medical Card
        </span>
        <DemoTag />
      </div>

      <Card className="p-6">
        <h1 className="text-[1.75rem] font-extrabold">{patient.name}</h1>
        <p className="text-ink-2">
          {patient.age} years · speaks Malayalam
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-sm bg-danger-soft p-3">
            <div className="flex items-center gap-1 text-xs font-bold text-danger">
              <Droplet className="size-3.5" aria-hidden /> Blood group
            </div>
            <div className="text-2xl font-extrabold">{patient.bloodGroup}</div>
          </div>
          <div className="rounded-sm bg-warn-soft p-3">
            <div className="flex items-center gap-1 text-xs font-bold text-warn">
              <TriangleAlert className="size-3.5" aria-hidden /> Allergies
            </div>
            <div className="font-extrabold">{patient.allergies.join(", ")}</div>
          </div>
        </div>

        <div className="mt-5">
          <div className="text-sm font-bold text-ink-2">Conditions</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {patient.conditions.map((c) => (
              <span key={c} className="rounded-full bg-surface-2 px-3 py-1.5 text-sm font-semibold">
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <div className="text-sm font-bold text-ink-2">Current medicines (verified)</div>
          <ul className="mt-2 space-y-2">
            {medicines.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <Pill className="size-4 text-green-700" aria-hidden />
                <span className="font-semibold">
                  {m.ingredient} {m.strength}
                </span>
                <span className="text-sm text-ink-2">({m.brand}) · {m.doseCode}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5">
          <div className="text-sm font-bold text-ink-2">Call family</div>
          <div className="mt-2 space-y-2">
            {contacts.slice(0, 2).map((c) => (
              <a key={c.id} href={`tel:${c.phone.replace(/\s/g, "")}`} className="flex min-h-12 items-center justify-between rounded-full bg-surface-2 px-4">
                <span className="font-bold">
                  {c.name} <span className="font-normal text-ink-2">· {c.relation}</span>
                </span>
                <Phone className="size-4" aria-hidden />
              </a>
            ))}
          </div>
        </div>
      </Card>

      <Card className="mt-4 flex items-center gap-4 p-5">
        <div className="rounded-sm bg-white p-2">{url && <QRCodeSVG value={url} size={104} level="M" />}</div>
        <div className="flex-1">
          <div className="font-bold">Lock-screen QR</div>
          <p className="text-sm text-ink-2">Save this as your lock-screen image so helpers can scan it.</p>
          <PillButton
            size="sm"
            className="mt-2"
            onClick={() => navigator.share?.({ title: "Emergency Medical Card", url }).catch(() => {})}
          >
            <Share2 className="size-4" aria-hidden /> Share link
          </PillButton>
        </div>
      </Card>
      <a href="tel:108" className="mt-4 flex min-h-14 items-center justify-center gap-2 rounded-full bg-danger text-lg font-extrabold text-white">
        <Phone className="size-5" aria-hidden /> Call ambulance 108
      </a>
    </main>
  );
}
