"use client";

import { CalendarClock, CalendarDays, Contact, FolderLock, HeartHandshake, Package, PiggyBank, PlusCircle, Settings } from "lucide-react";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { usePrefs } from "@/components/providers";

// Some of these pages are built by other parts of the team; we just link to them.
const ITEMS = [
  { href: "/today", Icon: CalendarDays, title: "Today", body: "Today's doses" },
  { href: "/meds/add", Icon: PlusCircle, title: "Add a medicine", body: "When there's no prescription to scan" },
  { href: "/locker", Icon: FolderLock, title: "Prescription locker", body: "Every prescription, safely stored" },
  { href: "/expiry", Icon: CalendarClock, title: "Expiry", body: "Strips that expire soon" },
  { href: "/refills", Icon: Package, title: "Refills", body: "Medicines running low" },
  { href: "/savings", Icon: PiggyBank, title: "Savings", body: "Brand vs Jan Aushadhi generic" },
  { href: "/contacts", Icon: Contact, title: "Emergency contacts", body: "Who to tell in an SOS" },
  { href: "/settings/care", Icon: HeartHandshake, title: "Care settings", body: "Refill, expiry and check-in rules" },
  { href: "/settings", Icon: Settings, title: "Settings", body: "Profile, language, card, privacy" },
];

export default function MorePage() {
  const { t } = usePrefs();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("more")} />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ITEMS.map(({ href, Icon, title, body }) => (
          <Link key={href} href={href} className="block">
            <Card className="flex h-full min-h-32 flex-col gap-3 p-4 transition-colors hover:bg-surface-2/60">
              <span className="flex size-11 items-center justify-center rounded-full bg-lime-300">
                <Icon className="size-5 text-ink" aria-hidden />
              </span>
              <span>
                <span className="block font-bold">{title}</span>
                <span className="block text-sm text-ink-2">{body}</span>
              </span>
            </Card>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-center text-sm text-ink-2">{t("disclaimer")}</p>
    </div>
  );
}
