"use client";

import { motion } from "motion/react";
import { CalendarCheck, LayoutGrid, MessageCircle, ScanLine, Siren, Users, WifiOff } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ActivityPing } from "@/components/activity-ping";
import { DueBanner } from "@/components/due-banner";
import { usePrefs } from "@/components/providers";
import { AssistantIcon } from "@/components/illustrations";
import { cn } from "@/components/ui";
import type { StringKey } from "@/lib/i18n";

const NAV: { href: string; key: StringKey; Icon: typeof MessageCircle }[] = [
  { href: "/chat", key: "chat", Icon: MessageCircle },
  { href: "/today", key: "today", Icon: CalendarCheck },
  { href: "/scan", key: "scan", Icon: ScanLine },
  { href: "/family", key: "family", Icon: Users },
  { href: "/more", key: "more", Icon: LayoutGrid },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export function OfflineBanner({ force = false }: { force?: boolean }) {
  const online = useOnline();
  if (online && !force) return null;
  return (
    <div role="status" className="flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">
      <WifiOff className="size-4" aria-hidden /> Offline — showing saved schedule. Taps will sync later.
    </div>
  );
}

/** SOS is always reachable: floating button on phones, pinned in side nav on laptops. */
export function SOSFab() {
  return (
    <Link href="/sos" aria-label="SOS emergency" className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 lg:hidden">
      <motion.span
        whileTap={{ scale: 0.94 }}
        className="relative flex size-16 items-center justify-center rounded-full bg-danger font-extrabold text-white shadow-float"
      >
        <span className="pulse-ring absolute inset-0 rounded-full bg-danger" aria-hidden />
        <span className="relative text-base tracking-wide">SOS</span>
      </motion.span>
    </Link>
  );
}

function BottomNav({ pathname }: { pathname: string }) {
  const { t } = usePrefs();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line/60 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden"
      aria-label="Main"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {NAV.map(({ href, key, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link href={href} className="flex min-h-16 flex-col items-center justify-center gap-1" aria-current={active ? "page" : undefined}>
                <span className="relative flex h-8 w-14 items-center justify-center">
                  {active && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-full bg-lime-300"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <Icon className={cn("relative size-5", active ? "text-ink" : "text-ink-2")} aria-hidden />
                </span>
                <span className={cn("text-[0.7rem] font-bold", active ? "text-ink" : "text-ink-2")}>{t(key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SideNav({ pathname }: { pathname: string }) {
  const { t } = usePrefs();
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-2 p-5 lg:flex">
      <Link href="/chat" className="mb-6 flex items-center gap-3 px-2">
        <AssistantIcon size={36} />
        <span className="text-xl font-extrabold">PharmiAI</span>
      </Link>
      {NAV.map(({ href, key, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn("relative flex min-h-12 items-center gap-3 rounded-full px-4 font-bold", active ? "text-ink" : "text-ink-2 hover:bg-white/70")}
          >
            {active && <motion.span layoutId="side-pill" className="absolute inset-0 rounded-full bg-lime-300" />}
            <Icon className="relative size-5" aria-hidden />
            <span className="relative">{t(key)}</span>
          </Link>
        );
      })}
      <Link href="/sos" className="mt-auto flex min-h-14 items-center justify-center gap-2 rounded-full bg-danger font-extrabold text-white shadow-float">
        <Siren className="size-5" aria-hidden /> SOS
      </Link>
    </aside>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl">
      <SideNav pathname={pathname} />
      <main className="min-w-0 flex-1 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[calc(9rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:pb-10">
        <div className="sticky top-2 z-20 flex justify-center empty:hidden">
          <OfflineBanner />
        </div>
        {children}
      </main>
      {/* Opening the app counts as activity for the "Are you okay?" check. */}
      <ActivityPing />
      <DueBanner />
      <BottomNav pathname={pathname} />
      {/* Chat has its own SOS button in the header, so the floating one doesn't cover the input bar. */}
      {pathname !== "/chat" && <SOSFab />}
    </div>
  );
}
