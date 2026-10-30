"use client";

import { Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { Card, PillButton, Toggle } from "@/components/ui";
import { api } from "@/lib/api-client";
import { useClientValue } from "@/lib/client";
import { useApi } from "@/lib/use-api";

type CardState = { enabled: boolean; token: string | null };

/** Settings section: turn the public Emergency Medical Card on/off, see its link and QR. */
export function CardSettings() {
  const { data, setData, error } = useApi<CardState>("/api/card");
  const origin = useClientValue(() => window.location.origin, "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function toggle(enabled: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      setData(await api<CardState>("/api/card", { method: "POST", json: { enabled } }));
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const url = data?.token && origin ? `${origin}/card/${data.token}` : null;

  return (
    <Card className="divide-y divide-line p-0">
      <div className="flex items-center gap-4 p-4">
        <div className="min-w-0 flex-1">
          <div className="font-bold">Emergency Medical Card</div>
          <div className="text-sm text-ink-2">A public page with your blood group, allergies, verified medicines and contacts. Anyone with the link can see it.</div>
        </div>
        <Toggle checked={data?.enabled ?? false} onChange={(v) => !busy && toggle(v)} label="Emergency Medical Card" />
      </div>
      {(error || msg) && <p className="p-4 text-sm font-semibold text-danger">{error ?? msg}</p>}
      {data?.enabled && url && (
        <div className="flex flex-wrap items-center gap-4 p-4">
          <div className="rounded-sm bg-white p-2">
            <QRCodeSVG value={url} size={96} level="M" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm break-all text-ink-2">{url}</p>
            <div className="flex flex-wrap gap-2">
              <PillButton size="sm" className="min-h-12" onClick={() => navigator.clipboard?.writeText(url).then(() => setMsg("Link copied"), () => {})}>
                <Copy className="size-4" aria-hidden /> Copy link
              </PillButton>
              <Link href={`/card/${data.token}`} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold">
                <ExternalLink className="size-4" aria-hidden /> Open
              </Link>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
