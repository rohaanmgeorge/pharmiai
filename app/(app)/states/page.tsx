"use client";

import { RefreshCw, ScanLine, UserPlus } from "lucide-react";
import { EmptyIllustration } from "@/components/illustrations";
import { OfflineBanner } from "@/components/shell";
import { Card, PageHeader, PillButton, SectionTitle, Skeleton } from "@/components/ui";

// Design reference: the shared loading / empty / error / offline states every screen uses.
function Empty({ kind, title, body, action }: { kind: Parameters<typeof EmptyIllustration>[0]["kind"]; title: string; body: string; action: React.ReactNode }) {
  return (
    <Card className="p-6 text-center">
      <EmptyIllustration kind={kind} />
      <div className="mt-3 text-lg font-bold">{title}</div>
      <p className="mx-auto mt-1 max-w-xs text-ink-2">{body}</p>
      <div className="mt-4">{action}</div>
    </Card>
  );
}

export default function StatesPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Design states" subtitle="Used across every screen" />

      <SectionTitle>Loading</SectionTitle>
      <Card className="space-y-4 p-4">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-14 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
        <Skeleton className="h-12 w-full rounded-full" />
      </Card>

      <SectionTitle>Empty</SectionTitle>
      <div className="grid gap-3 md:grid-cols-3">
        <Empty
          kind="meds"
          title="No medicines yet"
          body="Scan a prescription to get started."
          action={
            <PillButton variant="lime" size="sm">
              <ScanLine className="size-4" aria-hidden /> Scan prescription
            </PillButton>
          }
        />
        <Empty
          kind="family"
          title="Care together"
          body="Invite a family member to help with reminders."
          action={
            <PillButton variant="lime" size="sm">
              <UserPlus className="size-4" aria-hidden /> Invite
            </PillButton>
          }
        />
        <Empty kind="contacts" title="Add an emergency contact" body="We'll alert them first if you press SOS." action={<PillButton size="sm">Add contact</PillButton>} />
      </div>

      <SectionTitle>Error</SectionTitle>
      <Empty
        kind="error"
        title="Something went wrong"
        body="We couldn't read the prescription this time. Your photo is safe."
        action={
          <PillButton variant="green" size="sm">
            <RefreshCw className="size-4" aria-hidden /> Try again
          </PillButton>
        }
      />

      <SectionTitle>Offline</SectionTitle>
      <div className="flex justify-center">
        <OfflineBanner force />
      </div>
      <div className="mt-3">
        <Empty kind="offline" title="You're offline" body="Your schedule and Emergency Card still work. Scanning and voice need internet." action={null} />
      </div>
    </div>
  );
}
