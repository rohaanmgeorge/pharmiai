"use client";

import { Bell, Download, Lock, Trash2, Volume2 } from "lucide-react";
import { useState } from "react";
import { usePrefs } from "@/components/providers";
import { Card, cn, PageHeader, PillButton, SectionTitle, Toggle } from "@/components/ui";
import { LANGS } from "@/lib/i18n";

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

export default function SettingsPage() {
  const { lang, setLang, elder, setElder, t } = usePrefs();
  const [push, setPush] = useState(true);
  const [email, setEmail] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" />

      <SectionTitle>Language</SectionTitle>
      <Card className="grid grid-cols-3 gap-2 p-2">
        {LANGS.map((l) => (
          <button
            key={l.code}
            onClick={() => setLang(l.code)}
            aria-pressed={lang === l.code}
            className={cn("min-h-14 rounded-full text-lg font-bold transition-colors", lang === l.code ? "bg-lime-500 text-ink" : "text-ink-2 hover:bg-surface-2")}
          >
            {l.label}
          </button>
        ))}
      </Card>

      <SectionTitle>Accessibility</SectionTitle>
      <Card className="divide-y divide-line p-0">
        <Row title="Elder mode" body="Bigger text and buttons, fewer animations">
          <Toggle checked={elder} onChange={setElder} label="Elder mode" />
        </Row>
        <Row title="Read replies aloud" body="Uses this phone's voice for the chosen language">
          <Volume2 className="size-5 text-green-700" aria-hidden />
        </Row>
      </Card>

      <SectionTitle>Notifications</SectionTitle>
      <Card className="divide-y divide-line p-0">
        <Row title="Dose reminders" body="Push notification with pill strip photo">
          <Toggle checked={push} onChange={setPush} label="Dose reminders" />
        </Row>
        <Row title="Email alerts for family" body="Missed doses and SOS">
          <Toggle checked={email} onChange={setEmail} label="Email alerts" />
        </Row>
        <div className="p-4">
          <PillButton size="sm" variant="lime">
            <Bell className="size-4" aria-hidden /> Send a test reminder
          </PillButton>
        </div>
      </Card>

      <SectionTitle>Privacy</SectionTitle>
      <Card className="divide-y divide-line p-0">
        <Row title="Your data stays private" body="Prescription photos are private. Family sees them only with your consent.">
          <Lock className="size-5 text-green-700" aria-hidden />
        </Row>
        <div className="flex flex-wrap gap-2 p-4">
          <PillButton size="sm">
            <Download className="size-4" aria-hidden /> Download my data
          </PillButton>
          {confirmDelete ? (
            <PillButton size="sm" variant="danger" onClick={() => setConfirmDelete(false)}>
              <Trash2 className="size-4" aria-hidden /> Yes, delete everything
            </PillButton>
          ) : (
            <PillButton size="sm" className="text-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" aria-hidden /> Delete my data
            </PillButton>
          )}
        </div>
      </Card>

      <p className="mt-8 text-center text-sm text-ink-2">{t("disclaimer")}</p>
      <p className="mt-1 text-center text-xs text-ink-2">PharmiAI · hackathon prototype · demo data</p>
    </div>
  );
}
