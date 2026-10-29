import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Lang } from "@/lib/i18n";

// One tool the assistant (Gemini function calling) may use.
// Tools run AS the signed-in user (RLS applies). They return data from the database;
// the AI only chooses which tool to call and phrases short replies around the result.

export type AgentContext = {
  supabase: SupabaseClient; // user client, RLS applies
  user: User;
  patientId: string; // whose medicines we're talking about
  lang: Lang;
};

/** A card the screen renders from database rows (never from AI text). */
export type AgentCard = { kind: string; [key: string]: unknown };

export type ToolResult = {
  data: unknown; // what the model sees
  cards?: AgentCard[]; // what the person sees
};

export type AgentTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema
  run: (ctx: AgentContext, args: Record<string, unknown>) => Promise<ToolResult>;
};
