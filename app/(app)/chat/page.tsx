"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, CheckCheck, Mic, Paperclip, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DoseCard, MedicineSummary, SavingsCard } from "@/components/cards";
import { AssistantIcon } from "@/components/illustrations";
import { usePrefs } from "@/components/providers";
import { PillButton } from "@/components/ui";
import { type Dose, type DoseState, getMedicine, mockDose, todayDoses } from "@/lib/mock";

type Rich = { kind: "dose"; dose: Dose } | { kind: "savings" } | { kind: "medicine"; id: string };
type Msg = { id: number; from: "user" | "ai"; text: string; time: string; rich?: Rich; chips?: string[] };

const now = () => new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

const SEED: Msg[] = [
  {
    id: 1,
    from: "ai",
    text: "Good morning, Amma. It's time for your morning tablet.",
    time: "08:30",
    rich: { kind: "dose", dose: todayDoses[2] },
  },
  { id: 2, from: "user", text: "How much can I save on my medicines?", time: "08:32" },
  { id: 3, from: "ai", text: "Here is what you could save with Jan Aushadhi generics, for your verified medicines:", time: "08:32", rich: { kind: "savings" } },
  { id: 4, from: "user", text: "What is Glyconil for?", time: "08:33" },
  {
    id: 5,
    from: "ai",
    text: "This is from our checked medicine database:",
    time: "08:33",
    rich: { kind: "medicine", id: "glyconil" },
    chips: ["Side effects", "When is my next dose?", "Can I take two?"],
  },
];

// Canned design-mode replies. The real Voice Companion Agent replaces this (see PLAN.md §6).
function mockReply(text: string): Omit<Msg, "id" | "time" | "from"> {
  const q = text.toLowerCase();
  if (q.includes("two") || q.includes("double") || q.includes("dose") && q.includes("more"))
    return { text: "I can't give dose advice. Please ask your doctor or pharmacist. Would you like me to call Anjali?", chips: ["Call Anjali", "No, thanks"] };
  if (q.includes("next")) return { text: "Your next medicine is at 20:30:", rich: { kind: "dose", dose: todayDoses[3] } };
  if (q.includes("save")) return { text: "Here are your savings:", rich: { kind: "savings" } };
  if (q.includes("side")) return { text: "Common side effects, from our checked database:", rich: { kind: "medicine", id: "glyconil" } };
  return { text: "I'm not sure about that. I only answer from your verified medicines. You can ask about your next dose, savings or a medicine's uses." };
}

export default function ChatPage() {
  const { t } = usePrefs();
  const [messages, setMessages] = useState<Msg[]>(SEED);
  const [doseStates, setDoseStates] = useState<Record<string, DoseState>>({});
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, typing]);

  function send(text: string) {
    if (!text.trim()) return;
    setMessages((m) => [...m, { id: Date.now(), from: "user", text, time: now() }]);
    setDraft("");
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages((m) => [...m, { id: Date.now() + 1, from: "ai", time: now(), ...mockReply(text) }]);
    }, 900);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col">
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-3 bg-bg-from/85 px-4 py-3 backdrop-blur-lg sm:mx-0 sm:rounded-full sm:bg-white/80 sm:shadow-card">
        <AssistantIcon />
        <div className="min-w-0 flex-1">
          <div className="truncate font-extrabold">PharmiAI Assistant</div>
          <div className="flex items-center gap-1.5 truncate text-xs font-semibold text-ok">
            <span className="size-1.5 rounded-full bg-ok" /> Caring for Amma
          </div>
        </div>
        <Link href="/sos" className="flex min-h-11 items-center rounded-full bg-danger px-4 text-sm font-extrabold text-white lg:hidden">
          SOS
        </Link>
        <Link href="/settings" aria-label="Settings" className="flex size-12 items-center justify-center rounded-full hover:bg-white">
          <Settings className="size-5 text-ink-2" aria-hidden />
        </Link>
      </header>

      <div className="mt-4 space-y-4">
        <div className="text-center text-xs font-bold text-ink-2">Today</div>
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              layout="position"
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className={m.from === "user" ? "flex justify-end" : "flex justify-start"}
            >
              {m.from === "user" ? (
                <div className="max-w-[80%] rounded-[24px] rounded-br-md bg-lime-500 px-4 py-3 text-ink">
                  <p className="text-[1.05rem]">{m.text}</p>
                  <div className="mt-1 flex items-center justify-end gap-1 text-[0.7rem] font-semibold text-ink/60">
                    {m.time} <CheckCheck className="size-3.5" aria-label="Read" />
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-[92%] space-y-3">
                  <div className="rounded-[24px] rounded-bl-md bg-white px-4 py-3 shadow-card">
                    <p className="text-[1.05rem]">{m.text}</p>
                    <div className="mt-1 text-[0.7rem] font-semibold text-ink-2">{m.time}</div>
                  </div>
                  {m.rich?.kind === "dose" && (
                    <DoseCard
                      dose={mockDose({ ...m.rich.dose, state: doseStates[m.rich.dose.id] ?? m.rich.dose.state })}
                      onAct={(s) => setDoseStates((d) => ({ ...d, [(m.rich as { dose: Dose }).dose.id]: s }))}
                    />
                  )}
                  {m.rich?.kind === "savings" && <SavingsCard compact />}
                  {m.rich?.kind === "medicine" && <MedicineSummary med={getMedicine(m.rich.id)!} />}
                  {m.chips && (
                    <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                      {m.chips.map((c) => (
                        <PillButton key={c} size="sm" className="shrink-0" onClick={() => send(c)}>
                          {c}
                        </PillButton>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ))}
          {typing && (
            <motion.div key="typing" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex">
              <div className="flex gap-1.5 rounded-[24px] rounded-bl-md bg-white px-5 py-4 shadow-card" aria-label="Assistant is typing">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="typing-dot size-2 rounded-full bg-ink-2" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={endRef} className="h-28 lg:h-0" />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 px-3 lg:sticky lg:bottom-4 lg:mt-6 lg:px-0"
      >
        <div className="mx-auto flex max-w-2xl items-center gap-1 rounded-input bg-white p-1.5 shadow-float">
          <Link href="/voice" aria-label="Talk with voice" className="flex size-12 shrink-0 items-center justify-center rounded-full text-green-700 hover:bg-surface-2">
            <Mic className="size-6" aria-hidden />
          </Link>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("inputPlaceholder")}
            aria-label="Message"
            className="min-h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-2"
          />
          <Link href="/scan" aria-label="Scan prescription" className="flex size-12 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2">
            <Paperclip className="size-5" aria-hidden />
          </Link>
          <motion.button
            whileTap={{ scale: 0.92 }}
            type="submit"
            aria-label="Send"
            className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-ink text-ink disabled:border-line disabled:text-muted"
            disabled={!draft.trim()}
          >
            <ArrowUp className="size-5" aria-hidden />
          </motion.button>
        </div>
      </form>
    </div>
  );
}
