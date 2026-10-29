"use client";

import { motion } from "motion/react";
import { Bell, ChevronLeft, Hand, Mail, Phone, Repeat, User } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AdherenceBars, DoseCard } from "@/components/cards";
import { Avatar, Card, PillButton, SectionTitle } from "@/components/ui";
import { caredFor, escalationTimeline, mockDose, todayDoses } from "@/lib/mock";

const ICONS = { bell: Bell, repeat: Repeat, user: User, mail: Mail } as const;

export function MemberClient() {
  const { id } = useParams<{ id: string }>();
  const person = caredFor.find((p) => p.id === id) ?? caredFor[0];
  const [acked, setAcked] = useState(false);
  const doses = todayDoses.map((d, i) => (i === 2 ? { ...d, state: "missed" as const } : d));

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/family" className="mb-3 inline-flex min-h-12 items-center gap-1 font-bold text-ink-2">
        <ChevronLeft className="size-5" aria-hidden /> Family
      </Link>
      <div className="flex items-center gap-4">
        <Avatar name={person.name} color={person.color} size={64} />
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold">{person.relation}</h1>
          <p className="text-ink-2">
            {person.name} · You are a caregiver
          </p>
        </div>
        <a href="tel:+919000000000" aria-label={`Call ${person.relation}`} className="flex size-12 items-center justify-center rounded-full bg-lime-500">
          <Phone className="size-5" aria-hidden />
        </a>
      </div>

      <div className="lg:grid lg:grid-cols-2 lg:gap-8">
        <div>
          {person.alert && (
            <>
              <SectionTitle>Missed dose</SectionTitle>
              <Card className="overflow-hidden p-0">
                <div className="bg-danger-soft p-4">
                  <div className="font-bold text-danger">Pressana 5 · 08:30 not confirmed</div>
                  <div className="text-sm text-ink">We reminded Amma twice. You are being told because you are caregiver #1.</div>
                </div>
                <ol className="space-y-3 p-4">
                  {escalationTimeline.map((e, i) => {
                    const Icon = ICONS[e.icon];
                    return (
                      <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }} className="flex items-center gap-3">
                        <span className="flex size-8 items-center justify-center rounded-full bg-surface-2">
                          <Icon className="size-4" aria-hidden />
                        </span>
                        <span className="flex-1 text-sm">{e.text}</span>
                        <span className="text-xs font-bold text-ink-2">{e.time}</span>
                      </motion.li>
                    );
                  })}
                  {acked && (
                    <motion.li initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3">
                      <span className="flex size-8 items-center justify-center rounded-full bg-ok-soft text-ok">
                        <Hand className="size-4" aria-hidden />
                      </span>
                      <span className="flex-1 text-sm font-bold text-ok">You acknowledged — escalation stopped</span>
                      <span className="text-xs font-bold text-ink-2">now</span>
                    </motion.li>
                  )}
                </ol>
                <div className="grid grid-cols-2 gap-2 p-4 pt-0">
                  <PillButton variant="lime" onClick={() => setAcked(true)} disabled={acked}>
                    <Hand className="size-4" aria-hidden /> {acked ? "Acknowledged" : "I'll handle it"}
                  </PillButton>
                  <PillButton>
                    <Phone className="size-4" aria-hidden /> Call Amma
                  </PillButton>
                </div>
              </Card>
            </>
          )}
          <SectionTitle>Today</SectionTitle>
          <div className="space-y-3">
            {doses.map((d) => (
              <DoseCard key={d.id} dose={mockDose(d)} compact />
            ))}
          </div>
        </div>
        <div>
          <SectionTitle>Adherence</SectionTitle>
          <AdherenceBars />
        </div>
      </div>
    </div>
  );
}
