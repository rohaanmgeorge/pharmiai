"use client";

import { Reorder } from "motion/react";
import { FlaskConical, GripVertical, Phone, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar, Card, PageHeader, PillButton, SectionTitle } from "@/components/ui";
import { contacts as seed } from "@/lib/mock";

export default function ContactsPage() {
  const [items, setItems] = useState(seed);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Emergency contacts"
        subtitle="Alerted in this order during SOS"
        right={
          <PillButton size="sm" variant="lime">
            <Plus className="size-4" aria-hidden /> Add
          </PillButton>
        }
      />

      <Reorder.Group axis="y" values={items} onReorder={setItems} className="mt-4 space-y-3">
        {items.map((c, i) => (
          <Reorder.Item key={c.id} value={c} className="flex cursor-grab items-center gap-3 rounded-card bg-white p-4 shadow-card active:cursor-grabbing">
            <GripVertical className="size-5 shrink-0 text-muted" aria-hidden />
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-lime-300 text-sm font-extrabold">{i + 1}</span>
            <Avatar name={c.name} color={c.color} />
            <div className="min-w-0 flex-1">
              <div className="font-bold">{c.name}</div>
              <div className="truncate text-sm text-ink-2">
                {c.relation} · {c.lang}
              </div>
            </div>
            <a href={`tel:${c.phone.replace(/\s/g, "")}`} aria-label={`Call ${c.name}`} className="flex size-12 items-center justify-center rounded-full bg-surface-2">
              <Phone className="size-5" aria-hidden />
            </a>
          </Reorder.Item>
        ))}
      </Reorder.Group>
      <p className="mt-2 px-1 text-sm text-ink-2">Drag to change priority. Each person gets alerts in their own language.</p>

      <SectionTitle>Practice</SectionTitle>
      <Card className="flex items-center gap-3 p-4">
        <span className="flex size-10 items-center justify-center rounded-full bg-warn-soft text-warn">
          <FlaskConical className="size-5" aria-hidden />
        </span>
        <div className="flex-1">
          <div className="font-bold">Test SOS</div>
          <div className="text-sm text-ink-2">Contacts get a message marked TEST.</div>
        </div>
        <Link href="/sos?test=1" className="rounded-full border border-line px-4 py-2.5 font-bold">
          Try it
        </Link>
      </Card>
    </div>
  );
}
