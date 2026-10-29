"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Lock, Mail, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AssistantIcon } from "@/components/illustrations";
import { usePrefs } from "@/components/providers";
import { cn, PillButton } from "@/components/ui";
import { useClientValue } from "@/lib/client";
import { supabaseBrowser } from "@/lib/supabase/client";

function Field({ icon: Icon, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon: typeof Mail }) {
  return (
    <label className="flex min-h-14 items-center gap-3 rounded-input bg-white px-4 shadow-card focus-within:outline-3 focus-within:outline-green-700">
      <Icon className="size-5 shrink-0 text-ink-2" aria-hidden />
      <input {...props} className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-2" />
    </label>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { t, elder } = usePrefs();
  const next = useClientValue(() => new URLSearchParams(window.location.search).get("next") ?? "", "");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = supabaseBrowser();
    const { error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { name } } });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    // Only follow internal paths after login (never an outside link).
    router.replace(next.startsWith("/") && !next.startsWith("//") ? next : elder ? "/elder" : "/chat");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto w-fit">
          <AssistantIcon size={56} />
        </div>
        <h1 className="mt-4 text-[2rem] leading-tight font-light">{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
        <p className="mt-1 text-ink-2">PharmiAI keeps your family&apos;s medicines safe.</p>
      </div>

      <div className="mb-5 grid grid-cols-2 rounded-full bg-white/70 p-1 shadow-card">
        {(["signin", "signup"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={cn("relative min-h-11 rounded-full font-bold", mode === m ? "text-ink" : "text-ink-2")}>
            {mode === m && <motion.span layoutId="auth-pill" className="absolute inset-0 rounded-full bg-lime-500" />}
            <span className="relative">{m === "signin" ? "Log in" : "Sign up"}</span>
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3">
        <AnimatePresence initial={false}>
          {mode === "signup" && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <Field icon={User} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </motion.div>
          )}
        </AnimatePresence>
        <Field icon={Mail} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        <Field
          icon={Lock}
          type="password"
          placeholder="Password (8+ characters)"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          required
        />
        {error && (
          <p role="alert" className="rounded-sm bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
            {error}
          </p>
        )}
        <PillButton type="submit" variant="green" size="lg" className="w-full" disabled={busy}>
          {busy ? "Please wait…" : mode === "signin" ? "Log in" : "Create account"} <ArrowRight className="size-5" aria-hidden />
        </PillButton>
      </form>
      <p className="mt-6 text-center text-xs text-ink-2">{t("disclaimer")}</p>
    </main>
  );
}
