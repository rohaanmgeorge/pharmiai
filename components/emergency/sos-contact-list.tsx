"use client";

import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Clock, MapPin, MessageCircle, MessageSquareText, Phone, UserPlus } from "lucide-react";
import Link from "next/link";
import { Avatar, Card, cn } from "@/components/ui";
import type { SosContactView } from "./sos-links";

const COLORS = ["#fde68a", "#d4f28a", "#bfdbfe", "#fecaca", "#e9d5ff"];
const RELATION: Record<string, string> = { spouse: "Spouse", guardian: "Guardian", child: "Child", other: "Family / friend" };

/** One row per emergency contact: live "I'm going" status + one-tap WhatsApp / SMS / Call.
 *  The family sends the message from their own phone; PharmiAI never sends automatically. */
export function SosContactList({ contacts, sent, onSend, active }: { contacts: SosContactView[]; sent: Set<string>; onSend: (id: string) => void; active: boolean }) {
  if (contacts.length === 0) {
    return (
      <Card className="p-4">
        <p className="font-bold">No emergency contacts yet</p>
        <p className="text-sm text-ink-2">Family in your care circle got a notification. Add contacts so you can message them in one tap.</p>
        <Link href="/contacts" className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-full border border-line px-4 font-bold">
          <UserPlus className="size-4" aria-hidden /> Add contacts
        </Link>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-2">
        <MapPin className="size-4 text-danger" aria-hidden /> Tell your contacts — one tap each
      </div>
      <ul className="space-y-4">
        {contacts.map((c, i) => {
          const status = c.ackedAt ? "going" : sent.has(c.id) ? "sent" : "waiting";
          return (
            <li key={c.id}>
              <div className="flex items-center gap-3">
                <Avatar name={c.name} color={COLORS[i % COLORS.length]} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{c.name}</div>
                  <div className="text-sm text-ink-2">
                    {RELATION[c.relation] ?? c.relation} · #{c.priority}
                  </div>
                </div>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={status}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold",
                      status === "going" ? "bg-ok-soft text-ok" : status === "sent" ? "bg-lime-300 text-ink" : "bg-surface-2 text-ink-2",
                    )}
                  >
                    {status === "going" ? <CheckCircle2 className="size-3.5" aria-hidden /> : <Clock className="size-3.5" aria-hidden />}
                    {status === "going" ? "I'm going" : status === "sent" ? "Message opened" : "Not told yet"}
                  </motion.span>
                </AnimatePresence>
              </div>
              {active && !c.ackedAt && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <a href={c.whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={() => onSend(c.id)} className="flex min-h-12 items-center justify-center gap-1.5 rounded-full bg-green-700 text-sm font-bold text-white">
                    <MessageCircle className="size-4" aria-hidden /> WhatsApp
                  </a>
                  <a href={c.smsUrl} onClick={() => onSend(c.id)} className="flex min-h-12 items-center justify-center gap-1.5 rounded-full border border-line bg-surface text-sm font-bold">
                    <MessageSquareText className="size-4" aria-hidden /> SMS
                  </a>
                  <a href={c.callUrl} onClick={() => onSend(c.id)} className="flex min-h-12 items-center justify-center gap-1.5 rounded-full border border-line bg-surface text-sm font-bold" aria-label={`Call ${c.name}`}>
                    <Phone className="size-4" aria-hidden /> Call
                  </a>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
