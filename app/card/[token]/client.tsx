"use client";

import { Droplet, HeartPulse, Phone, Pill, Share2, TriangleAlert } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useClientValue } from "@/lib/client";
import { Card, PillButton } from "@/components/ui";

export type CardData = {
  name: string;
  lang: string;
  bloodGroup: string | null;
  allergies: string[];
  conditions: string[];
  medicines: { name: string; ingredients: string; strength: string; dose: string | null }[];
  contacts: { id: string; name: string; relation: string; phone: string }[];
};

const SPEAKS: Record<string, string> = { en: "English", ml: "Malayalam", hi: "Hindi" };
const RELATION: Record<string, string> = { spouse: "Spouse", guardian: "Guardian", child: "Child", other: "Family / friend" };

function AmbulanceButton() {
  return (
    <a href="tel:108" className="mt-4 flex min-h-14 items-center justify-center gap-2 rounded-full bg-danger text-lg font-extrabold text-white">
      <Phone className="size-5" aria-hidden /> Call ambulance 108
    </a>
  );
}

// Public, read-only Emergency Medical Card (opened from the share link or lock-screen QR).
export function EmergencyCardClient({ data }: { data: CardData | null }) {
  const url = useClientValue(() => window.location.href, "");

  if (!data) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 text-center">
        <Card className="p-6">
          <HeartPulse className="mx-auto size-10 text-ink-2" aria-hidden />
          <h1 className="mt-3 text-xl font-bold">This card is not available</h1>
          <p className="mt-1 text-ink-2">The owner may have turned it off. In an emergency, call 108 or 112.</p>
        </Card>
        <AmbulanceButton />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-10">
      <div className="mb-4 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 rounded-full bg-danger px-4 py-2 text-sm font-extrabold text-white">
          <HeartPulse className="size-4" aria-hidden /> Emergency Medical Card
        </span>
      </div>

      <Card className="p-6">
        <h1 className="text-[1.75rem] font-extrabold">{data.name || "Name not set"}</h1>
        <p className="text-ink-2">Speaks {SPEAKS[data.lang] ?? "English"}</p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-sm bg-danger-soft p-3">
            <div className="flex items-center gap-1 text-xs font-bold text-danger">
              <Droplet className="size-3.5" aria-hidden /> Blood group
            </div>
            <div className="text-2xl font-extrabold">{data.bloodGroup || "Not given"}</div>
          </div>
          <div className="rounded-sm bg-warn-soft p-3">
            <div className="flex items-center gap-1 text-xs font-bold text-warn">
              <TriangleAlert className="size-3.5" aria-hidden /> Allergies
            </div>
            <div className="font-extrabold">{data.allergies.length ? data.allergies.join(", ") : "None listed"}</div>
          </div>
        </div>

        {data.conditions.length > 0 && (
          <div className="mt-5">
            <div className="text-sm font-bold text-ink-2">Conditions</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {data.conditions.map((c) => (
                <span key={c} className="rounded-full bg-surface-2 px-3 py-1.5 text-sm font-semibold">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5">
          <div className="text-sm font-bold text-ink-2">Current medicines (verified)</div>
          {data.medicines.length === 0 ? (
            <p className="mt-1 text-sm text-ink-2">No verified medicines on record.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {data.medicines.map((m, i) => (
                <li key={`${m.name}-${i}`} className="flex items-start gap-2">
                  <Pill className="mt-1 size-4 shrink-0 text-green-700" aria-hidden />
                  <span>
                    <span className="font-semibold">
                      {m.ingredients} {m.strength}
                    </span>{" "}
                    <span className="text-sm text-ink-2">
                      ({m.name}){m.dose ? ` · ${m.dose}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {data.contacts.length > 0 && (
          <div className="mt-5">
            <div className="text-sm font-bold text-ink-2">Call family</div>
            <div className="mt-2 space-y-2">
              {data.contacts.map((c) => (
                <a key={c.id} href={`tel:${c.phone}`} className="flex min-h-12 items-center justify-between gap-2 rounded-full bg-surface-2 px-4">
                  <span className="min-w-0 truncate font-bold">
                    {c.name} <span className="font-normal text-ink-2">· {RELATION[c.relation] ?? c.relation}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-sm font-semibold">
                    {c.phone} <Phone className="size-4" aria-hidden />
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card className="mt-4 flex items-center gap-4 p-5">
        <div className="rounded-sm bg-white p-2">{url && <QRCodeSVG value={url} size={104} level="M" />}</div>
        <div className="flex-1">
          <div className="font-bold">Lock-screen QR</div>
          <p className="text-sm text-ink-2">Save this as your lock-screen image so helpers can scan it.</p>
          <PillButton size="sm" className="mt-2" onClick={() => navigator.share?.({ title: "Emergency Medical Card", url }).catch(() => {})}>
            <Share2 className="size-4" aria-hidden /> Share link
          </PillButton>
        </div>
      </Card>
      <AmbulanceButton />
    </main>
  );
}
