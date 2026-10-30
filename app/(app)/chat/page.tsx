"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Camera, CheckCheck, Mic, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AgentCards, pendingFrom, type AgentCard } from "@/components/chat/agent-cards";
import { askAgent, patientIdFromUrl } from "@/components/chat/ask-agent";
import { AssistantIcon } from "@/components/illustrations";
import { usePrefs } from "@/components/providers";
import { PillButton } from "@/components/ui";
import type { Lang } from "@/lib/i18n";
import { useApi } from "@/lib/use-api";

// The conversation lives in React state only: nothing is stored, so no health data is kept on the phone.
type Msg = { id: number; from: "user" | "ai"; text: string; time: string; cards?: AgentCard[] };

const GREETING_ID = 1;
const now = () => new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

const GREETING: Record<Lang, string> = {
  en: "Hi! Ask me about today's medicines, expiry dates or savings.",
  ml: "നമസ്കാരം! ഇന്നത്തെ മരുന്നുകൾ, കാലാവധി, ലാഭം എന്നിവയെക്കുറിച്ച് ചോദിക്കൂ.",
  hi: "नमस्ते! आज की दवाओं, एक्सपायरी या बचत के बारे में पूछें।",
};

const CHIPS: Record<Lang, string[]> = {
  en: ["What's next?", "Mark my morning dose taken", "Which medicines expire soon?"],
  ml: ["അടുത്ത മരുന്ന് ഏത്?", "രാവിലത്തെ ഡോസ് കഴിച്ചു", "ഏതൊക്കെ മരുന്നുകളുടെ കാലാവധി തീരാറായി?"],
  hi: ["अगली दवा कौन सी है?", "सुबह की खुराक ले ली", "कौन सी दवाएँ जल्दी एक्सपायर होंगी?"],
};

const OFFLINE: Record<Lang, string> = {
  en: "Sorry, I couldn't reach the assistant. Please try again.",
  ml: "ക്ഷമിക്കണം, സഹായിയുമായി ബന്ധപ്പെടാനായില്ല. വീണ്ടും ശ്രമിക്കൂ.",
  hi: "माफ़ कीजिए, सहायक से जुड़ नहीं पाए। फिर से कोशिश करें।",
};

type Me = { me: { name: string } | null; caredFor: { id: string; name: string }[] };

export default function ChatPage() {
  const { t, lang } = usePrefs();
  const [messages, setMessages] = useState<Msg[]>(() => [{ id: GREETING_ID, from: "ai", text: "", time: now() }]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const { data: me } = useApi<Me>("/api/me");
  const [patientId] = useState(patientIdFromUrl);
  const caringFor = patientId ? me?.caredFor.find((p) => p.id === patientId)?.name : me?.me?.name;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, typing]);

  async function send(text: string) {
    if (!text.trim() || typing) return;
    const last = messages[messages.length - 1];
    // A confirm-back is only answerable right after it was asked.
    const pending = last?.from === "ai" ? pendingFrom(last.cards) : null;
    const history = messages.slice(1).map((m) => ({ role: m.from === "user" ? ("user" as const) : ("model" as const), text: m.text }));
    setMessages((m) => [...m, { id: Date.now(), from: "user", text, time: now() }]);
    setDraft("");
    setTyping(true);
    try {
      const res = await askAgent({ text, lang, history, pending });
      setMessages((m) => [...m, { id: Date.now() + 1, from: "ai", text: res.speech, time: now(), cards: res.cards }]);
    } catch {
      setMessages((m) => [...m, { id: Date.now() + 1, from: "ai", text: OFFLINE[lang], time: now() }]);
    } finally {
      setTyping(false);
    }
  }

  const lastId = messages[messages.length - 1]?.id;

  return (
    <div className="mx-auto flex max-w-2xl flex-col">
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-3 bg-bg-from/85 px-4 py-3 backdrop-blur-lg sm:mx-0 sm:rounded-full sm:bg-white/80 sm:shadow-card">
        <AssistantIcon />
        <div className="min-w-0 flex-1">
          <div className="truncate font-extrabold">PharmiAI Assistant</div>
          <div className="flex items-center gap-1.5 truncate text-xs font-semibold text-ok">
            <span className="size-1.5 rounded-full bg-ok" /> {caringFor ? `Caring for ${caringFor}` : "Online"}
          </div>
        </div>
        <Link href="/sos" className="flex min-h-11 items-center rounded-full bg-danger px-4 text-sm font-extrabold text-white lg:hidden">
          SOS
        </Link>
        <Link href="/settings" aria-label="Settings" className="flex size-12 items-center justify-center rounded-full hover:bg-white">
          <Settings className="size-5 text-ink-2" aria-hidden />
        </Link>
      </header>

      <div className="mt-4 space-y-4" aria-live="polite">
        <div className="text-center text-xs font-bold text-ink-2">{t("today")}</div>
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
                    {m.time} <CheckCheck className="size-3.5" aria-label="Sent" />
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-[92%] space-y-3">
                  <div className="rounded-[24px] rounded-bl-md bg-white px-4 py-3 shadow-card">
                    {/* The greeting follows the chosen language (it is read after the page loads). */}
                    <p className="text-[1.05rem]">{m.id === GREETING_ID ? GREETING[lang] : m.text}</p>
                    <div className="mt-1 text-[0.7rem] font-semibold text-ink-2">{m.time}</div>
                  </div>
                  {m.cards && m.cards.length > 0 && (
                    <AgentCards cards={m.cards} confirmActive={m.id === lastId && !typing} onConfirm={(answer) => send(answer)} />
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
        {!typing && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {CHIPS[lang].map((c) => (
              <PillButton key={c} className="shrink-0" onClick={() => send(c)}>
                {c}
              </PillButton>
            ))}
          </div>
        )}
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
            maxLength={500}
            className="min-h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-2"
          />
          <Link href="/scan" aria-label="Scan prescription" className="flex size-12 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2">
            <Camera className="size-5" aria-hidden />
          </Link>
          <motion.button
            whileTap={{ scale: 0.92 }}
            type="submit"
            aria-label="Send"
            className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-ink text-ink disabled:border-line disabled:text-muted"
            disabled={!draft.trim() || typing}
          >
            <ArrowUp className="size-5" aria-hidden />
          </motion.button>
        </div>
      </form>
    </div>
  );
}
