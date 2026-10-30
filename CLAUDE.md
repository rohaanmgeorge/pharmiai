# PharmiAI — notes for Claude Code

Mobile-first PWA medicine care assistant (hackathon prototype, fictional data). Full plan: `PLAN.md`; design tokens: `DESIGN.md`; progress: `STATUS.md`.

## Architecture
- One **Next.js App Router** app on Vercel (UI in `app/`, API route handlers in `app/api/`). Tailwind v4, shadcn/ui, lucide-react, Motion, Serwist PWA.
- **Supabase**: Postgres + RLS + Auth + private Storage. Migrations in `supabase/migrations/`, seed CSVs in `supabase/seed/`.
- **pg_cron + pg_net** call `POST /api/cron/tick` every minute (header `x-cron-secret`).
- AI: **Google Gemini** via `@google/genai` (free tier; team has no Anthropic key). A stronger Gemini model reads prescriptions (structured JSON output); a faster one runs the voice + escalation agents (function calling). Confirm exact model IDs with the ListModels API before use. Second reading: Google Cloud Vision. Voice: browser Web Speech API only.

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

## Zero-Guess rules (never weaken)
- Status is decided only by `lib/safety/status.ts` `computeStatus()` + DB RPC `confirm_item()`; the LLM never sets status.
- Schedules, reminders, medicine info, and prices exist only for `verified` items — enforced by DB trigger `require_verified`, not just UI.
- Medical facts, prices, generics, and shorthand come from DB tables only, never LLM text.
- `safety_log` is append-only.
- Look-alike names: show all candidates, never auto-pick. Never auto-fill dose/timing/duration.

## Rules
- Never put secrets in client code, logs, or commits. `SUPABASE_SERVICE_ROLE_KEY` only on the server (`supabaseAdmin()`), and only AFTER checking `canManage`/`canView` — or in `/api/cron/tick` behind `x-cron-secret`.
- API routes start with `requireUser(request)` from `lib/server/auth.ts` (cookie or `Authorization: Bearer`).
- Never commit `data/private/` or `.env*`.
- No health data in logs.
- Team are beginners: keep code simple, small files, plain names, short comments explaining *why*.
- Update `STATUS.md` after each phase.
