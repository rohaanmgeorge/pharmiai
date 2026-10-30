# Status

_Last updated: 2026-10-30 06:15 IST_

## Done
- Planning docs, full UI design with demo data (all screens), deployed at https://pharmiai.vercel.app (auto-deploy from `main`).
- Supabase: schema + RLS (`0001_init.sql`), catalog CSVs imported, email + password login with route protection (`proxy.ts`) — sign-up confirmed working live.
- AI switched to **Google Gemini** (no Anthropic key). Two blind readings (`gemini-3.5-flash` / `gemini-3.5-flash-lite`); Cloud Vision not used yet.
- Zero-Guess core in `lib/safety/` with 35 passing tests; `POST /api/prescriptions` runs the real scan pipeline.
- Eval on the private demo prescription: 3 Verified (all correct), 1 Needs check, 1 Not recognized, **wrong-but-Verified = 0**.

## Gate (scan → approve → reminder → Taken) — LIVE on https://pharmiai.vercel.app
- Real photo upload → two blind Gemini readings → Zero-Guess status per line → review screen (photo, both readings, look-alike chooser, type-only-missing fields, doctor name confirm, duplicate warning) → confirm (server re-checks) → "Remind me" creates schedules for Verified only → Today from the database → Taken / Skip / Snooze (idempotent) → push reminders with Taken from the notification → every-minute clock (`supabase/cron.sql`) also marks missed doses, tells the family, makes refill suggestions, expiry alerts, "Are you okay?" checks.
- End-to-end test against the real database (temporary user, deleted after): 3 Verified, look-alike overrule rejected, metformin duplicate shown, 3 schedules, Taken replay not double-counted, wrong cron secret 403, other person's data 403, schedule for unverified item rejected by the DB trigger.
- Migrations 0001–0003 applied. `npm run find-missing` lists real medicines missing from the catalog.

## Scope change (2026-10-30 ~02:00) — see PLAN.md §16
- Moved to **Committed** (after the gate): prescription locker, medicine scan + expiry (merged), refill agent, unresponsive "Are you okay?" check, live family dashboard. Defaults approved.
- Testing now uses **real family prescriptions** with personal details covered (free Gemini tier may keep inputs).
- Honest: these do not all fit at full depth; the simplify order is in PLAN.md §16.11. Waiting for team approval of the updated docs before any feature code.

## Issues / notes
- Real prescriptions will show "Not recognized" until Person B adds their medicines to the catalog.
- Migration `0002_gemini_readings.sql` — confirm it has been run in Supabase.
- Malayalam/Hindi strings are drafts (Person B to review).

## All committed features — LIVE (06:30)
Medicine scan + expiry, prescription locker, refill agent, family care circle + live dashboard (Realtime + 30 s fallback), "Are you okay?" check, SOS (test mode, contact links, public ack) + emergency contacts + emergency card, settings (profile, language, card, delete my data), savings, medicine detail, chat + voice assistant (Gemini tools + output guard + keyword fallback), Elder screen.
- Checks: tsc, eslint, `next build`, 106 unit tests pass. End-to-end against the real DB with temp users: 34/36 pass. Failing: "Delete my data" until migration `0007_emergency.sql` is applied.

## Known gaps
- Run `supabase/migrations/0007_emergency.sql` (then re-test delete).
- Real medicines need catalog rows (Person B, `npm run find-missing`).
- New screens' text is English only; Malayalam/Hindi drafts need review. No strip photo tested yet (Person B: strip photos in `data/private/strips/`).
- Not tested on a real phone yet: push delivery, camera, voice, Realtime on mobile data.
- Usable stock doesn't subtract expired strips automatically beyond the expiry job.

## Next step
- Phone test checklist (PLAN §11), demo rehearsal, PPT.
