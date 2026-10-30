"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, FlaskConical, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ContactForm } from "@/components/emergency/contact-form";
import type { Contact, ContactInput } from "@/components/emergency/contact-input";
import { EmptyCard, ErrorCard, LoadingCards } from "@/components/states";
import { Avatar, Card, PageHeader, PillButton, SectionTitle } from "@/components/ui";
import { api } from "@/lib/api-client";
import { patientQuery, useApi } from "@/lib/use-api";

const COLORS = ["#fde68a", "#d4f28a", "#bfdbfe", "#fecaca", "#e9d5ff"];
const RELATION = { spouse: "Spouse", guardian: "Guardian", child: "Child", other: "Other" } as const;
const LANG = { en: "English", ml: "മലയാളം", hi: "हिन्दी" } as const;

type Data = { contacts: Contact[]; canManage: boolean };

export default function ContactsPage() {
  const [query] = useState(patientQuery);
  const { data, error, loading, reload } = useApi<Data>(`/api/contacts${query}`);
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actError, setActError] = useState<string | null>(null);

  const contacts = data?.contacts ?? [];
  const canManage = data?.canManage ?? false;

  async function save(v: Partial<ContactInput>) {
    if (editing === "new") await api(`/api/contacts${query}`, { method: "POST", json: v });
    else if (editing) await api(`/api/contacts/${editing.id}`, { method: "PATCH", json: v });
    setEditing(null);
    reload();
  }

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setActError(null);
    try {
      await work();
      reload();
    } catch (e) {
      setActError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Move up/down (buttons are easier than dragging for elders), then number everyone 1, 2, 3…
  function move(i: number, dir: -1 | 1) {
    const order = [...contacts];
    [order[i], order[i + dir]] = [order[i + dir], order[i]];
    run(async () => {
      for (const [n, c] of order.entries()) {
        if (c.priority !== n + 1) await api(`/api/contacts/${c.id}`, { method: "PATCH", json: { priority: n + 1 } });
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Emergency contacts"
        subtitle="Shown in this order during SOS"
        right={
          canManage &&
          !editing && (
            <PillButton size="sm" variant="lime" onClick={() => setEditing("new")}>
              <Plus className="size-4" aria-hidden /> Add
            </PillButton>
          )
        }
      />

      <AnimatePresence initial={false}>
        {editing && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <Card className="mt-4 p-5">
              <h2 className="mb-4 text-lg font-bold">{editing === "new" ? "Add a contact" : `Edit ${editing.name}`}</h2>
              <ContactForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? undefined : editing} onSave={save} onCancel={() => setEditing(null)} />
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {loading && (
        <div className="mt-4">
          <LoadingCards />
        </div>
      )}
      {error && (
        <div className="mt-4">
          <ErrorCard message={error} onRetry={reload} />
        </div>
      )}
      {actError && <p className="mt-3 rounded-sm bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{actError}</p>}

      {data && contacts.length === 0 && !editing && (
        <div className="mt-4">
          <EmptyCard
            kind="contacts"
            title="No emergency contacts yet"
            body="Add the people to call first in an emergency. Each gets a private link to say “I'm going”."
            action={
              canManage && (
                <PillButton variant="green" onClick={() => setEditing("new")}>
                  <Plus className="size-5" aria-hidden /> Add a contact
                </PillButton>
              )
            }
          />
        </div>
      )}

      <ul className="mt-4 space-y-3">
        {contacts.map((c, i) => (
          <motion.li layout key={c.id} className="rounded-card bg-surface p-4 shadow-card">
            <div className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-lime-300 text-sm font-extrabold text-ink">{i + 1}</span>
              <Avatar name={c.name} color={COLORS[i % COLORS.length]} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{c.name}</div>
                <div className="truncate text-sm text-ink-2">
                  {RELATION[c.relation]} · {LANG[c.lang]} · {c.phone}
                </div>
              </div>
              <a href={`tel:${c.phone}`} aria-label={`Call ${c.name}`} className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-2">
                <Phone className="size-5" aria-hidden />
              </a>
            </div>
            {canManage && (
              <div className="mt-3 flex flex-wrap gap-2">
                <PillButton size="sm" aria-label={`Move ${c.name} up`} disabled={busy || i === 0} onClick={() => move(i, -1)} className="min-h-12">
                  <ArrowUp className="size-4" aria-hidden />
                </PillButton>
                <PillButton size="sm" aria-label={`Move ${c.name} down`} disabled={busy || i === contacts.length - 1} onClick={() => move(i, 1)} className="min-h-12">
                  <ArrowDown className="size-4" aria-hidden />
                </PillButton>
                <PillButton size="sm" className="min-h-12" disabled={busy} onClick={() => setEditing(c)}>
                  <Pencil className="size-4" aria-hidden /> Edit
                </PillButton>
                {confirmId === c.id ? (
                  <>
                    <PillButton size="sm" variant="danger" className="min-h-12" disabled={busy} onClick={() => run(() => api(`/api/contacts/${c.id}`, { method: "DELETE" })).then(() => setConfirmId(null))}>
                      <Trash2 className="size-4" aria-hidden /> Yes, remove
                    </PillButton>
                    <PillButton size="sm" variant="ghost" className="min-h-12" onClick={() => setConfirmId(null)}>
                      Keep
                    </PillButton>
                  </>
                ) : (
                  <PillButton size="sm" className="min-h-12 text-danger" disabled={busy} onClick={() => setConfirmId(c.id)}>
                    <Trash2 className="size-4" aria-hidden /> Remove
                  </PillButton>
                )}
              </div>
            )}
          </motion.li>
        ))}
      </ul>
      {contacts.length > 1 && <p className="mt-2 px-1 text-sm text-ink-2">Use the arrows to change the order. Each message is written in the contact&apos;s language.</p>}

      <SectionTitle>Practice</SectionTitle>
      <Card className="flex items-center gap-3 p-4">
        <span className="flex size-10 items-center justify-center rounded-full bg-warn-soft text-warn">
          <FlaskConical className="size-5" aria-hidden />
        </span>
        <div className="flex-1">
          <div className="font-bold">Test SOS</div>
          <div className="text-sm text-ink-2">Messages are marked TEST. No one is alarmed.</div>
        </div>
        <Link href={`/sos?test=1${query ? `&${query.slice(1)}` : ""}`} className="flex min-h-12 items-center rounded-full border border-line px-4 font-bold">
          Try it
        </Link>
      </Card>
    </div>
  );
}
