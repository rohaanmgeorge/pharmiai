# PharmiAI — notes for Claude Code

Mobile-first PWA medicine care assistant (hackathon prototype, fictional data). Full plan: `PLAN.md`; design tokens: `DESIGN.md`; progress: `STATUS.md`.

## Architecture
- One **Next.js App Router** app on Vercel (UI in `app/`, API route handlers in `app/api/`). Tailwind v4, shadcn/ui, lucide-react, Motion, Serwist PWA.
- **Supabase**: Postgres + RLS + Auth + private Storage. Migrations in `supabase/migrations/`, seed CSVs in `supabase/seed/`.
- **pg_cron + pg_net** call `POST /api/cron/tick` every minute (header `x-cron-secret`).
- AI: **Google Gemini** via `@google/genai` (free tier; team has no Anthropic key). A stronger Gemini model reads prescriptions (structured JSON output); a faster one runs the voice + escalation agents (function calling). Confirm exact model IDs with the ListModels API before use. Voice: Gemini (`lib/server/gemini-voice.ts`: listen with flash-lite, speak with the TTS model), browser Web Speech as fallback. Medicines are identified by Gemini (`lib/ai/identify-medicine.ts`) and saved once in `medicine_catalog` with `source_kind = 'ai'` (no downloaded dataset). Free-tier quota: `gemini-3.5-flash` = 20 requests/day, so everything except reading A uses flash-lite.

## Code map
- `app/(app)/*` — screens inside the app shell (bottom nav / side nav + SOS button). Full-screen flows: `app/scan`, `app/voice`, `app/sos`, `app/elder`, `app/card/[token]`.
- `components/ui.tsx` (Card, PillButton, StatusBadge…), `components/cards.tsx` (DoseCard, SavingsCard…), `components/shell.tsx`, `components/providers.tsx` (language + Elder mode).
- `lib/mock.ts` — fictional demo data used during the design phase; replace screen by screen with real data.
- `lib/i18n.ts` — UI strings (en/ml/hi). `lib/voice.ts` — Web Speech + mic level hooks.

## Gotchas
- Next.js 16: read `node_modules/next/dist/docs/` before using unfamiliar APIs (see `AGENTS.md`).
- `cacheComponents` is OFF on purpose: `usePathname()` inside `<Suspense>` caused an infinite server render loop. Don't wrap URL hooks in Suspense.
- Tailwind v4 via `@tailwindcss/postcss`. Design tokens live in `app/globals.css` (`@theme`).
- Never white text on lime (`bg-lime-500`); use `text-ink`, or `bg-green-700` for white text.

## Commands
- `npm run dev` · `npm run build` · `npm run lint` · `npm test` (Vitest)
- `npm run eval` — prescription evaluation over `data/private/` (metric: wrong-but-Verified must be 0)
- `npx supabase db push` — apply migrations

## Verification (changed 2026-10-30, team decision)
- Scans are **Verified automatically** (`verified_by = 'ai'`) by `lib/safety/auto-verify.ts`: reading 1 first, closest saved name if no exact match; nothing is invented (missing timing → no reminder until chosen; missing days → 90-day reminders). Differences go into `ai_notes`, shown on the review screen. A line matching no medicine is "Unreadable line – not added".
- Gemini errors are turned into plain messages by `lib/ai/errors.ts` (daily limit with wait time, busy, overloaded, timeout).

## Zero-Guess rules (original design; partly replaced by the section above)
- Status is decided only by `lib/safety/status.ts` `computeStatus()` + DB RPC `confirm_item()`; the LLM never sets status.
- Schedules, reminders, medicine info, and prices exist only for `verified` items — enforced by DB trigger `require_verified`, not just UI.
- Facts about a specific medicine, prices, generics, and shorthand come from DB tables (cards). The assistant may give *general* health information in its own words (companion mode, decided 2026-10-30), shown with a "General information from AI" label; `guardReply(..., question)` still blocks personal dose instructions, diagnoses, unknown amounts, and naming a pill described by its look. Danger signs always show SOS (rule in `lib/agent/run.ts`).
- Hand-added medicines (`/meds/add`) must be picked from the catalog — never free text — with the dose from the shorthand table.
- AI-identified medicines are labelled "not pharmacist-reviewed"; prices are AI estimates for the profile's city. A person still confirms every medicine before reminders exist (`require_verified`).
- `safety_log` is append-only.
- Look-alike names: show all candidates, never auto-pick. Never auto-fill dose/timing/duration.

## Rules
- Never put secrets in client code, logs, or commits. `SUPABASE_SERVICE_ROLE_KEY` only on the server (`supabaseAdmin()`), and only AFTER checking `canManage`/`canView` — or in `/api/cron/tick` behind `x-cron-secret`.
- API routes start with `requireUser(request)` from `lib/server/auth.ts` (cookie or `Authorization: Bearer`).
- Never commit `data/private/` or `.env*`.
- No health data in logs.
- Team are beginners: keep code simple, small files, plain names, short comments explaining *why*.
- Update `STATUS.md` after each phase.
