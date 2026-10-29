# Status

_Last updated: 2026-10-30 ~02:15 IST_

## Done
- Planning docs, full UI design with demo data (all screens), deployed at https://pharmiai.vercel.app (auto-deploy from `main`).
- Supabase: schema + RLS (`0001_init.sql`), catalog CSVs imported, email + password login with route protection (`proxy.ts`) — sign-up confirmed working live.
- AI switched to **Google Gemini** (no Anthropic key). Two blind readings (`gemini-3.5-flash` / `gemini-3.5-flash-lite`); Cloud Vision not used yet.
- Zero-Guess core in `lib/safety/` with 35 passing tests; `POST /api/prescriptions` runs the real scan pipeline.
- Eval on the private demo prescription: 3 Verified (all correct), 1 Needs check, 1 Not recognized, **wrong-but-Verified = 0**.

## Scope change (2026-10-30 ~02:00) — see PLAN.md §16
- Moved to **Committed** (after the gate): prescription locker, medicine scan + expiry (merged), refill agent, unresponsive "Are you okay?" check, live family dashboard. Defaults approved.
- Testing now uses **real family prescriptions** with personal details covered (free Gemini tier may keep inputs).
- Honest: these do not all fit at full depth; the simplify order is in PLAN.md §16.11. Waiting for team approval of the updated docs before any feature code.

## Issues / notes
- Real prescriptions will show "Not recognized" until Person B adds their medicines to the catalog.
- Migration `0002_gemini_readings.sql` — confirm it has been run in Supabase.
- Malayalam/Hindi strings are drafts (Person B to review).

## Next step
- **Gate (before 06:30):** wire scanner → `/api/prescriptions`; review screen from real data with confirm; approve → schedules; Today from DB with `act_on_dose`; cron tick + web push.
