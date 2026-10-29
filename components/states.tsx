"use client";

import { RotateCw } from "lucide-react";
import { EmptyIllustration } from "@/components/illustrations";
import { Card, PillButton, Skeleton } from "@/components/ui";

// The three calm states every real screen needs: loading, error, empty.

export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-24 rounded-card" />
      ))}
    </div>
  );
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="p-6 text-center">
      <div className="mx-auto w-fit">
        <EmptyIllustration kind="error" />
      </div>
      <p className="mt-3 font-bold">{message}</p>
      {onRetry && (
        <PillButton className="mt-4" onClick={onRetry}>
          <RotateCw className="size-4" aria-hidden /> Try again
        </PillButton>
      )}
    </Card>
  );
}

export function EmptyCard({ kind = "meds", title, body, action }: { kind?: "meds" | "family" | "contacts"; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <Card className="p-6 text-center">
      <div className="mx-auto w-fit">
        <EmptyIllustration kind={kind} />
      </div>
      <p className="mt-3 text-lg font-bold">{title}</p>
      {body && <p className="mt-1 text-ink-2">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}
