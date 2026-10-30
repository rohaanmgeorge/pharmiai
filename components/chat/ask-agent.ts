import { api } from "@/lib/api-client";
import type { Lang } from "@/lib/i18n";
import type { AgentCard } from "./agent-cards";

// One call to the assistant. History and the pending confirm-back live only in React state
// on the screen (never saved), and are sent along so the server knows what "yes" means.

export type Turn = { role: "user" | "model"; text: string };
export type AgentAnswer = { speech: string; cards: AgentCard[]; general?: boolean };

/** "?patient=<id>" in the address bar → that person's medicines (caregiver view). */
export function patientIdFromUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("patient") ?? undefined;
}

export function askAgent(input: { text: string; lang: Lang; history: Turn[]; pending: { doseId: string; action: string } | null }): Promise<AgentAnswer> {
  return api<AgentAnswer>("/api/agent", {
    method: "POST",
    json: { ...input, history: input.history.slice(-10), patientId: patientIdFromUrl() },
  });
}
