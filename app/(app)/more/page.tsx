"use client";

import { ChevronRight, Contact, HeartPulse, Layers, PiggyBank, ScanLine, Settings, Accessibility } from "lucide-react";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { usePrefs } from "@/components/providers";

const ITEMS = [
  { href: "/savings", Icon: PiggyBank, title: "Savings", body: "Brand vs Jan Aushadhi generic prices" },
  { href: "/contacts", Icon: Contact, title: "Emergency contacts", body: "Who we alert, and in what order" },
  { href: "/card/demo", Icon: HeartPulse, title: "Emergency Medical Card", body: "Share link and lock-screen QR" },
  { href: "/review", Icon: ScanLine, title: "Last prescription", body: "Review what was scanned" },
  { href: "/elder", Icon: Accessibility, title: "Elder mode", body: "Big text, big buttons, one Talk button" },
  { href: "/settings", Icon: Settings, title: "Settings", body: "Language, notifications, privacy" },
  { href: "/states", Icon: Layers, title: "Design states", body: "Loading, empty, error and offline screens" },
];

export default function MorePage() {
  const { t } = usePrefs();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("more")} />
      <Card className="mt-4 divide-y divide-line p-0">
        {ITEMS.map(({ href, Icon, title, body }) => (
          <Link key={href} href={href} className="flex min-h-18 items-center gap-4 p-4 hover:bg-surface-2/60">
            <span className="flex size-11 items-center justify-center rounded-full bg-lime-300">
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{title}</span>
              <span className="block truncate text-sm text-ink-2">{body}</span>
            </span>
            <ChevronRight className="size-5 text-ink-2" aria-hidden />
          </Link>
        ))}
      </Card>
      <p className="mt-6 text-center text-sm text-ink-2">{t("disclaimer")}</p>
    </div>
  );
}
