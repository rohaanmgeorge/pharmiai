"use client";

import { Mail, MessageCircle, MessageSquareText, RefreshCw } from "lucide-react";
import { cn, PillButton } from "@/components/ui";
import { LANGS, type Lang } from "@/lib/i18n";
import type { Channel } from "./types";

// Editable reorder message + language chips + share buttons (DESIGN.md §7).
// Sharing only opens the person's own WhatsApp / SMS / email app; we never send anything.
export function DraftEditor({
  text,
  onText,
  lang,
  onLang,
  drafting,
  onShare,
  sharing,
  canPhone,
  canEmail,
  readOnly,
}: {
  text: string;
  onText: (v: string) => void;
  lang: Lang;
  onLang: (l: Lang) => void; // also asks for a fresh draft in that language
  drafting: boolean;
  onShare: (c: Channel) => void;
  sharing: Channel | null;
  canPhone: boolean;
  canEmail: boolean;
  readOnly?: boolean;
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Message language">
        {LANGS.map((l) => (
          <button
            key={l.code}
            role="radio"
            aria-checked={lang === l.code}
            disabled={readOnly || drafting}
            onClick={() => onLang(l.code)}
            className={cn(
              "min-h-12 rounded-full px-4 font-bold transition-colors disabled:opacity-60",
              lang === l.code ? "bg-green-700 text-white" : "border border-line bg-surface text-ink",
            )}
          >
            {l.code === "en" ? "EN" : l.label}
          </button>
        ))}
        {!readOnly && (
          <PillButton variant="ghost" onClick={() => onLang(lang)} disabled={drafting} aria-label="Write the message again">
            <RefreshCw className={cn("size-4", drafting && "motion-safe:animate-spin")} aria-hidden /> {drafting ? "Writing…" : "Redo"}
          </PillButton>
        )}
      </div>

      <label className="mt-3 block">
        <span className="sr-only">Message to the pharmacy</span>
        <textarea
          value={text}
          onChange={(e) => onText(e.target.value)}
          readOnly={readOnly}
          rows={6}
          maxLength={1000}
          placeholder={drafting ? "Writing a message…" : "Write your message to the pharmacy"}
          className="w-full rounded-sm border border-line bg-surface p-4 text-base leading-relaxed outline-none focus:border-green-700"
        />
      </label>
      <p className="px-1 text-xs text-ink-2">Check and edit the message. It is sent only when you tap send in your own app.</p>

      {!readOnly && (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <PillButton variant="green" onClick={() => onShare("whatsapp")} disabled={!canPhone || !text.trim() || sharing !== null}>
            <MessageCircle className="size-5" aria-hidden /> {sharing === "whatsapp" ? "Opening…" : "WhatsApp"}
          </PillButton>
          <PillButton onClick={() => onShare("sms")} disabled={!canPhone || !text.trim() || sharing !== null}>
            <MessageSquareText className="size-5" aria-hidden /> {sharing === "sms" ? "Opening…" : "SMS"}
          </PillButton>
          <PillButton onClick={() => onShare("email")} disabled={!canEmail || !text.trim() || sharing !== null}>
            <Mail className="size-5" aria-hidden /> {sharing === "email" ? "Opening…" : "Email"}
          </PillButton>
        </div>
      )}
    </div>
  );
}
