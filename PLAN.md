# PharmiAI — Plan

> Hackathon: Project Nevermore, Domain 1 (AI Automation). Prototype with fictional demo data. **Not a medical device — never diagnoses, prescribes, or gives dosing advice.**
> Companion docs: [DESIGN.md](DESIGN.md) · [CLAUDE.md](CLAUDE.md) · [STATUS.md](STATUS.md) · [docs/NEEDS.md](docs/NEEDS.md)

## 1. Decisions taken

| # | Decision |
|---|---|
| 1 | **Claude API** (TypeScript SDK `@anthropic-ai/sdk`). Two models, IDs checked against the current docs (see the API notes below): **`claude-opus-5-5`** reads prescriptions; **`claude-haiku-5-5`** runs the voice and escalation agents. |
| 2 | Second independent reading: **Google Cloud Vision** `DOCUMENT_TEXT_DETECTION`, using an API key that only works with Vision and is only used on the server. Free for 1,000 images a month; needs a billing card. |
| 3–4 | Voice: **browser only.** Speech-to-text uses `webkitSpeechRecognition` (`en-IN`, `ml-IN`, `hi-IN`). Text-to-speech uses `speechSynthesis`. Fallback when a voice is missing (see §14): pre-recorded MP3s of fixed phrases, plus large text on screen. |
| 5 | **Supabase:** Postgres, magic-link email login, private Storage, row-level security (RLS). Region: Mumbai. |
| 6 | **Supabase `pg_cron` + `pg_net`** call `POST /api/cron/tick` every minute, with the header `x-cron-secret`. |
| 7 | **Web Push** (`web-push` library with VAPID keys) and **Resend** email (free, 100 a day). |
| 8 | **Next.js App Router** as one installable PWA. Tailwind v4, shadcn/ui, lucide-react, **Motion** (`motion/react`), hand-written SVG charts, `qrcode.react`, Serwist for the service worker, Zod for validation, Vitest for tests. |
| 9 | Install `gh` with Homebrew, then commit, push, and use **Vercel's dashboard Import from GitHub** so every push deploys automatically. |
| 10 | **2 people, about 13.5 hours.** Person A is the Builder; Person B handles Data, Design and Demo (§13). |

Claude API notes, checked against the current skill and docs:
- **Opus 5.5:**
  - Thinking can't be turned off. Set `output_config.effort` to `"high"` for reading prescriptions.
  - Forced `tool_choice` (`any` or `tool`) returns an error, so prescription reading uses **structured outputs** (`output_config.format`, a JSON schema).
  - Always check `stop_reason === "refusal"` before reading the reply.
  - Enable `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`).
- **Haiku 5.5:** use `tool_choice: auto` with `strict: true` on tools, and effort `"low"` so voice replies come back fast.
- **All models:** don't send `temperature`; never assume a prefill.

## 2. Architecture

```
Phone/Laptop (Next.js PWA, Serwist SW, IndexedDB outbox)
   │  HTTPS (Supabase JWT cookie)
   ▼
Next.js on Vercel  ── /app (UI)  ── /api/* (route handlers, server-only secrets)
   │        │            │              │
   │        │            │              ├─► Anthropic API (Opus 5.5 read A; Haiku 5.5 agents)
   │        │            │              ├─► Google Cloud Vision (read B)
   │        │            │              ├─► web-push (VAPID) / Resend email
   ▼        ▼            ▼
Supabase: Postgres (+RLS, triggers, pg_cron, pg_net) · Auth · Storage (private buckets)
   ▲
   └── pg_cron every 1 min ── pg_net POST /api/cron/tick (x-cron-secret)
```

**Data flows**

1. **Scan → review → approve → schedule → reminder → Taken**
   1. The phone takes a photo and uploads it to `POST /api/prescriptions`, which stores it in the private `rx-images` bucket.
   2. The server runs **reading A** (Opus 5.5, structured, transcription only) and **reading B** (Cloud Vision text, then a fixed rule-based parser) **in parallel**. Both readings go into `readings`, and every reading is recorded in `safety_log`.
   3. A rule-based matcher compares each reading with `medicine_catalog`, expands shorthand from the `shorthand` table, and runs `computeStatus()`. The results become `prescription_items`, each with exactly one status.
   4. On the review screen, the person confirms or edits each item. `POST /api/items/:id/confirm` re-runs `computeStatus()` with `human_confirmed=true`, so an item reaches `verified` only if every rule passes. The confirmation is logged.
   5. `POST /api/prescriptions/:id/approve` creates `schedules` for **verified items only**. A database trigger rejects anything else.
   6. Every minute, the cron tick creates `dose_events` that are due and sends a push notification that includes the pill-strip photo.
   7. When the person taps **Taken**, `POST /api/doses/:id/act` records it once only, because `op_id` is unique. Stock goes down by one.
2. **Voice → agent → tools → reply**
   1. The browser turns speech into text, and the text goes to `POST /api/agent/voice` with `{text, lang}`.
   2. The Haiku 5.5 tool loop runs. Every tool reads or writes the database as the signed-in user, so RLS applies.
   3. The reply contains `{speech, cards[]}`. **Medicine facts appear only inside cards the server builds from database rows**, never in text the model wrote.
   4. The browser speaks the reply with `speechSynthesis` or a pre-recorded clip.
3. **Missed dose → escalation**
   1. The tick marks a dose `missed` when it is `pending` and 30 minutes overdue.
   2. The Escalation Agent's `run()` follows a fixed ladder:
      - at 0 minutes, a push to the patient;
      - at 30 minutes, the caregivers are told in **their** language, using a template;
      - at 60 minutes, the next caregiver gets an email.
   3. Each step is recorded in `escalations`. A caregiver who taps "Acknowledge" stops the ladder.
4. **SOS → contacts → acknowledgment**
   1. Holding the SOS button or saying the voice phrase starts a 5-second cancel countdown. Then `POST /api/sos` saves the location and creates an `sos_events` row.
   2. Push notifications and emails go to contacts in priority order, with a map link and an "I'm going" link.
   3. `POST /api/sos/:id/ack` records the acknowledgment, and the patient's screen updates live through Supabase Realtime.
   4. A one-tap `tel:108` / `tel:112` button is always shown.

## 3. Folder structure
```
app/
  (onboarding)/welcome, login
  (app)/layout.tsx            bottom nav + SOS FAB
  (app)/chat                  home = assistant chat
  (app)/voice                 Voice Mode
  (app)/scan, scan/[id]/review
  (app)/today, meds/[id], savings, family, family/[patientId], contacts, sos, settings
  card/[token]/page.tsx       public Emergency Medical Card
  api/…                       route handlers (§5)
components/ui (shadcn) · components/pharmi (DoseCard, MedicineCard, StatusBadge, …)
lib/
  safety/status.ts            computeStatus() — Zero-Guess core
  safety/shorthand.ts         table-driven expansion
  safety/match.ts             normalise + exact match + look-alike candidates
  safety/duplicates.ts, stock.ts, escalation.ts (pure functions)
  ai/readPrescription.ts      Opus 5.5 structured transcription
  ai/visionOcr.ts, ai/parseOcr.ts
  ai/agents/{intake,voice,escalation}.ts + tools/
  supabase/{server,client,admin}.ts · push.ts · email.ts · i18n/{en,ml,hi}.json
  offline/outbox.ts (IndexedDB)
supabase/migrations/*.sql · supabase/seed/*.csv
scripts/eval-prescriptions.ts · scripts/import-catalog.ts
tests/*.test.ts
data/private/            (gitignored: sample prescriptions + ground truth)
public/audio/{ml,hi}/*.mp3 · public/icons, manifest
docs/NEEDS.md · PLAN.md · DESIGN.md · CLAUDE.md · STATUS.md
```

## 4. Database schema and RLS
Helper functions (`security definer`; each returns a boolean):
- `is_self(p)`: true if `p` is the signed-in user (`p = auth.uid()`).
- `can_view(p)`: `is_self(p)`, or the user is a circle member of `p` with consent `given`.
- `can_manage(p)`: `is_self(p)`, or the user is a circle member with role `caregiver` and consent `given`.

| Table | Key columns | RLS |
|---|---|---|
| profiles | id (=auth uid), name, lang(en/ml/hi), elder_mode, tz, blood_group, allergies | own row read/write; circle `can_view` read |
| care_circle_members | patient_id, member_id, role(caregiver/viewer), consent(pending/given/revoked), invited_by, consented_at | patient full; member reads own row; **only the patient can set consent=given** (trigger) |
| medicine_catalog | id, brand, brand_norm, form, strength, mrp, pack_size, uses_{en,ml,hi}, side_effects_{en,ml,hi}, source, reviewer, reviewed_at | read: authenticated; write: none (service role import only) |
| catalog_ingredients | catalog_id, ingredient_norm, amount | same as catalog |
| generic_products | ja_code, name, ingredients, strength, mrp, pack_size | read auth; no writes |
| shorthand | code, slots(int[4] M/A/E/N), times_per_day, as_needed, meaning_{en,ml,hi} | read auth; no writes |
| prescriptions | id, patient_id, image_path, uploaded_by, state(draft/approved) | `can_view` read; `can_manage` insert/update |
| readings | prescription_id, engine(claude/gcv), raw jsonb | `can_view` read; insert server only |
| prescription_items | prescription_id, text_a, text_b, catalog_id?, candidates jsonb, strength, dose_code, duration_days, timing, **status**(verified/needs_check/not_recognized), confirmed_by/at | `can_view` read; **status column not writable by clients** (column grant revoked; only `confirm_item()` RPC sets it) |
| schedules | patient_id, item_id, slot_times time[], start_date, end_date, stock, pill_photo_path, active | `can_view` read; insert via `approve_prescription()` RPC; **trigger `require_verified` rejects item.status≠verified** |
| dose_events | schedule_id, patient_id, due_at, state(pending/taken/skipped/snoozed/missed), acted_by, acted_at, **op_id unique** | `can_view` read; update via `act_on_dose()` RPC (`can_manage`) |
| escalations | dose_event_id, level, member_id, channel, sent_at, acked_at | patient + caregivers read |
| push_subscriptions | user_id, endpoint, keys | own only |
| emergency_contacts | patient_id, name, phone, email, relation(spouse/guardian/child/other), priority, lang | patient + caregivers |
| sos_events / sos_acks | patient_id, lat, lng, state, is_test / sos_id, contact_id, acked_at | patient + circle read; ack via signed token |
| emergency_cards | patient_id, share_token, enabled | owner; public read **only via `/card/[token]` server route** |
| **safety_log** | id bigserial, at, actor, patient_id, item_id, event, payload (no images/names) | insert only via server; **update/delete revoked + trigger raises** → append-only |

## 5. API endpoints
Every endpoint validates its input with Zod and uses the Supabase server client signed in as the user, so RLS applies. Only `/api/cron/tick` uses the service role, and only after it checks the `x-cron-secret` header.

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | /api/prescriptions | upload image (≤5 MB, jpeg/png/heic→jpeg), run Intake Agent, return items | user, `can_manage(patient)` |
| GET | /api/prescriptions/:id | items + statuses + candidates | `can_view` |
| POST | /api/items/:id/confirm | `{catalog_id, strength, dose_code, duration_days, timing}` → recompute status | `can_manage` |
| POST | /api/prescriptions/:id/approve | build schedules from verified items only | `can_manage` |
| GET | /api/today | today's dose events | `can_view` |
| POST | /api/doses/:id/act | `{action: taken/skip/snooze, op_id uuid}` idempotent | `can_manage` |
| POST | /api/agent/voice | `{text, lang}` → `{speech, cards}` | user |
| GET | /api/meds/:itemId/info | uses/side effects/prices (403 unless verified) | `can_view` |
| GET | /api/savings | brand vs Jan Aushadhi per verified med + yearly | `can_view` |
| POST/PATCH | /api/circle, /api/circle/:id/consent | invite; patient grants/revokes | user / patient only |
| CRUD | /api/contacts | emergency contacts | patient/caregiver |
| POST | /api/sos, /api/sos/:id/cancel, /api/sos/:id/ack | SOS lifecycle (`is_test` flag) | user / signed ack token |
| POST | /api/push/subscribe | save subscription | user |
| POST | /api/cron/tick | create due events, push, mark missed, escalate, restock, course end | `x-cron-secret` |
| GET | /card/[token] | read-only Emergency Medical Card | token |

## 6. AI agent design and Zero-Guess guardrails

**Prescription Intake Agent**
1. **Reading A** (Opus 5.5, effort `high`, structured output). The system prompt (outline): *"Transcribe exactly what is written. Do not correct spelling, do not infer a medicine you can't read, and do not fill missing fields. For every field return `{text, legible: bool}`; anything you can't read becomes `null` with `legible:false`."* The output is `items[]`, each with `name, strength, dose_code, duration, timing, notes`.
2. **Reading B:** Cloud Vision text goes through `parseOcr()`, a rule-based parser that uses regexes for strengths, dose codes and durations.
3. **Tool step** (Haiku 5.5, auto tools): `search_catalog(name)` → candidates, `expand_shorthand(code)` → table row, `check_duplicates(patient_id, ingredients)`, `flag_unclear(item, reason)`. The tools only add candidates or flags. **They never set a status.**
4. **`computeStatus()` in code** decides the status. It returns:
   - `not_recognized` if neither reading matches a catalog entry;
   - `verified` only if **all** of these are true: (a) an exact normalized match to one catalog entry, (b) A and B resolve to the same entry, (c) the strength exists for that entry, (d) dose_code, duration and timing are all present and in the shorthand table, (e) `human_confirmed`;
   - `needs_check` otherwise, and always when there's more than one look-alike candidate (every candidate is shown; none is picked automatically).

**Voice Companion Agent** (Haiku 5.5, effort `low`)
- **Tools:**
  - `get_today_schedule`
  - `mark_dose(event_id, action)`: needs a confirm-back first ("You took Metformin 500, the 8 AM dose. Shall I mark it taken?" then yes/no).
  - `get_medicine_card(item_id)`: verified items only; returns a card ID, never free text.
  - `get_savings_card`
  - `notify_family(message_template_id)`
  - `start_sos`: needs a confirm-back, then the countdown runs on the device.
  - `refuse(reason)`
- **System prompt rules:** never diagnose, recommend a dose, or identify a tablet from a description. Answer medical facts only by attaching the card from `get_medicine_card`. Reply in `{lang}`. If unsure, say "I'm not sure. Please ask your doctor or pharmacist."
- **Output guard on the server:** if the reply text contains a dose number, a medicine name, or a "take/stop" verb that didn't come from a tool result, the server replaces it with a template refusal and logs `voice_guard_block`.

**Missed Dose Escalation Agent** (Haiku 5.5)
- **Tools:** `get_missed_dose`, `get_circle(patient)`, `send_push`, `send_email`, `log_escalation`.
- **Timing and eligibility live in code** (`lib/safety/escalation.ts`), and the tools refuse anything that breaks them. Message text comes from i18n templates in each recipient's language.
- If the LLM call fails, the deterministic ladder still runs, so no escalation is ever lost.

**Every rule mapped to where it's enforced and how it's tested**

| Rule | Enforced in | Test |
|---|---|---|
| One status per item | DB enum NOT NULL + `computeStatus` | unit: matrix of inputs |
| Verified criteria | `computeStatus` + `confirm_item()` RPC | unit + RLS test: client can't update status |
| Look-alikes not auto-picked | `match.ts` returns all within distance ≤2 / same prefix | unit: "Amaryl"/"Amaril", "Losar"/"Lasix" |
| No auto-fill | parser returns null; schema `legible` flags; UI shows empty required field | unit + eval |
| Reminders/info/prices only for Verified | `require_verified` trigger; `/info` 403; savings query joins verified | integration test against local DB |
| Facts from DB only | cards rendered from rows; voice output guard | unit on guard |
| Shorthand table-driven | `shorthand` table + `expandShorthand` | unit: 1-0-1, OD, BD, TDS, HS, SOS; unknown → null |
| Voice refusals | prompt + guard | scripted prompts (dose advice, "white round tablet?", diagnosis) |
| Append-only log | revoked grants + trigger | test: UPDATE/DELETE raise |

Note: "SOS" on a prescription means **"When needed"**. That label is always shown, so it can't be confused with the emergency SOS feature.

## 7. Screens (layout from §16, states for each)
| Screen | Pattern |
|---|---|
| Welcome / onboarding | illustration + lime "Get Started →", language picker (EN/മലയാളം/हिन्दी), Elder mode toggle |
| Chat (home) | header w/ assistant icon + "PharmiAI Assistant" + gear; lime user bubbles; white rich cards; input bar (mic, field, camera, send) |
| Voice Mode | "Voice Mode" pill; huge transcript; waveform; red stop, X, ✓, timer |
| Scanner | full-screen camera, breathing brackets, scan line, "Please hold still…" toast, capture button, stat chips |
| Review | sparkle + big sentence; expandable item cards w/ StatusBadge; candidate chooser; laptop: image left / items right |
| Today | dose timeline, Taken/Skip/Snooze pills, pill photo |
| Medicine detail | MedicineCard (verified only), duplicates warning |
| Savings | SavingsCard count-up, yearly total |
| Adherence | weekly rounded bars (lime taken / grey missed) + legend |
| Family | member list (avatar, role, consent chip); family dashboard on laptop |
| Emergency contacts | list w/ priority + relation |
| SOS | countdown ring, live ack status cards, 108/112 buttons, test-mode banner |
| Emergency card | public read-only page + QR |
| Settings | language, elder mode, notifications, delete my data |

All screens: **loading** = skeleton shimmer; **empty** = friendly illustration + one action; **error** = a calm card with "Try again" and no technical text; **offline** = top banner "Offline: showing saved schedule", with actions queued.

## 8. Animation plan
Motion library (`motion/react`). Why: spring physics, `layout`/`layoutId` shared-element transitions, `AnimatePresence` exit animations and `useReducedMotion`, all in one library that works with React 19 and Next.js. CSS covers the simple loops (shimmer, scan line).

| Area | Animation |
|---|---|
| Pages | `opacity 0→1, y 8→0`, 220 ms |
| Card → detail | `layoutId` shared element |
| Chat bubbles | spring scale 0.96→1 + fade |
| Typing | 3-dot loop |
| Assistant text | streams in token by token |
| Voice | word-by-word reveal (spoken words dark, interim words grey + blinking cursor); waveform bars use `scaleY` from an AnalyserNode RMS at 60 fps through rAF writing straight to the style (not React state); stop button pulse `scale 1↔1.06` at 1.6 s |
| Scanner | brackets breathe `scale 1↔1.02` at 2 s; scan line `translateY` sweep at 1.8 s; success check draws via SVG `pathLength` |
| Cards | height via `layout`; StatusBadge morphs with `layoutId` + crossfade from "Needs check" to "Verified" |
| Savings | count-up over 800 ms with `useSpring` |
| SOS | `conic-gradient` ring countdown, large calm numbers, no flashing |
| Buttons | `whileTap scale 0.97`; skeleton shimmer as a CSS gradient translate |

Rules:
- Animate only transform and opacity, 150–350 ms.
- Under `prefers-reduced-motion`, everything becomes a fade.
- **Elder mode:** durations ×1.5, no springs, no looping effects except the waveform.

## 9. Offline
- **Cached by Serwist:** the app shell; `/api/today` for the user's own schedule (stale-while-revalidate, own data only); the Emergency Medical Card.
- **Dose actions offline:** stored in an IndexedDB outbox `{op_id(uuid v4, created at tap), event_id, action, at}`, and replayed when the device is back online (on the `online` event, or when the app opens).
- **No double counting:** the server's `act_on_dose()` RPC uses `insert … on conflict (op_id) do nothing`, so a replayed action is never counted twice.
- **Needs the network:** reminders, scanning, voice and SOS. SOS offline falls back to the `tel:112` link and an SMS link (`sms:`, the phone's own SMS app, so no paid SMS service).

## 10. Privacy
- **Consent:**
  - Explicit consent at onboarding, covering the Web Speech note that audio is processed by the browser vendor.
  - The **elder must accept** before a caregiver gets any access. Consent can be revoked at any time.
- **Minimal data:** name, language, and the medicines the patient approved. Locations are stored only for SOS events.
- **Images:** prescription images go in a private bucket and are opened through signed URLs that expire after 60 seconds.
- **Deletion:** "Delete my data" in Settings cascades through every table and removes Storage objects.
- **Logs:** no health data in logs. `safety_log` holds IDs and codes only. Server `console` output is scrubbed.
- **Repo:** `data/private/` and `.env*` are gitignored. All demo data is fictional.

## 11. Testing
- **Vitest unit tests:**
  - `computeStatus` matrix
  - `match` (look-alikes)
  - `shorthand`
  - `duplicates` (by ingredient)
  - `stock` (days left, restock threshold, course end)
  - escalation timing (fake clock)
  - outbox idempotency
  - voice output guard
- **Database tests:** run against Supabase with two test users. They check RLS for cross-user reads, that a client can't update `status`, that a schedule for a non-verified item is rejected, and that `safety_log` UPDATE/DELETE raise an error.
- **`scripts/eval-prescriptions.ts`:** runs the pipeline over `data/private/prescriptions/*.jpg` and compares the output with `*.truth.json`. It reports per-item status counts, precision of Verified, and **"wrong but Verified" (must be 0; the build fails otherwise)**. The human-confirm step is simulated as "confirm whatever is shown", which is the worst case.
- **Manual phone checklist** on Android Chrome (the main target) and an iPhone with the app added to the Home Screen: camera, mic (en/ml/hi), push received when the app is closed, location permission, offline Taken → sync, SOS test mode, Elder mode.

## 12. Timeline (IST)
| Time | Phase | Exit criterion |
|---|---|---|
| 22:30–23:15 | P0 setup: accounts, `gh`, scaffold, first deploy, Supabase project, env vars | Vercel URL loads on a phone |
| 23:15–02:30 | P1: migrations + RLS + seed CSVs; scan → read A/B → status → review → confirm → approve | demo prescription gets Verified/Needs check correctly |
| 02:30–05:00 | P2: schedules, cron tick, push with pill photo, Taken/Skip/Snooze, offline outbox | push arrives and Taken is recorded |
| 05:00–06:15 | Hardening, unit tests, deploy | **HARD GATE: scan → approve → reminder → Taken on the deployed app on a real phone** |
| 06:30 | Progress review | |
| 06:30–08:30 | P3: voice mode + voice agent, duplicates, savings, family circle + consent, escalation, SOS + card/QR | each demoable once |
| 08:30–09:00 | PPT (Person B starts at 07:30) | |
| 09:00 | Mentor evaluation | |
| 09:00–11:00 | P4: animations polish, elder mode, eval script numbers, adherence chart; if-time features | |
| 11:00 | **Feature freeze**; record backup demo video | |
| 11:00–12:00 | Rehearse demo ×3 | |

**Cut first, in this order:** every if-time feature → adherence chart → laptop family dashboard → animations polish (keep the basic fades) → email escalation (keep push) → lock-screen QR (keep the share link).
**Never cut:** Zero-Guess (statuses, triggers, the log), consent, permission prompts, the safety disclaimer, the 108/112 call button.

## 13. Work split (2 people)
- **Person A, Builder:** drives Claude Code, owns repo, Supabase, Vercel and API keys, reviews each step and deploys, and tests on their own phone after every deploy.
- **Person B, Data, Design and Demo:**
  - the catalog CSV (around 30 medicines that appear in the sample prescriptions), the Jan Aushadhi price CSV and the shorthand CSV;
  - ground-truth JSON files;
  - reviewing the Malayalam and Hindi strings, and recording the fallback MP3s (about 15 phrases × 2 languages);
  - the illustrations source;
  - the phone test checklist;
  - the PPT and backup recording;
  - the demo script.

## 14. Risks and fallbacks
| Risk | Fallback |
|---|---|
| No Malayalam/Hindi text-to-speech voice on the phone | pre-recorded MP3s of fixed phrases; big text; banner "Voice not available, reading on screen" |
| Malayalam speech-to-text weak or missing (iOS/Firefox) | large type-to-talk field + quick-reply chips; demo on Android Chrome |
| Mic conflict between SpeechRecognition and the Web Audio analyser on Android | waveform driven by speech events (simulated amplitude) |
| Push not delivered on iOS | demo on Android; in-app banner + email |
| Anthropic rate limit or outage | retry with backoff; fallback `"default"`; cached demo result for the demo prescription |
| Cloud Vision billing not ready | items stay "Needs check" (fails safe); reading B shown as unavailable |
| pg_cron misfires | "Run tick now" button in test mode (hits the same endpoint with the secret, server-side) |
| Venue Wi-Fi fails | phone hotspot; recorded backup video |
| Time overrun | follow the cut list in §12 |

## 15. Demo script (3 min)
1. **0:00** Problem: one line about elderly parents, many prescriptions and missed doses. Show Elder mode in Malayalam.
2. **0:20** Scan a fictional prescription. The scanner animation runs and chips appear: "4 medicines found · 1 needs check".
3. **0:50** Review screen: one look-alike shows two candidates, none auto-picked. Confirm it, and the badge morphs to Verified. Point out the safety log.
4. **1:20** Duplicate ingredient warning, then the savings card counts up: "₹X saved a year with Jan Aushadhi".
5. **1:40** Approve. Trigger "Run tick now" and the push arrives with the pill photo. Tap Taken.
6. **2:00** Voice Mode in Malayalam: "What's my next tablet?" gets an answer. "Can I take two?" is refused politely.
7. **2:25** Skip a dose. Escalation reaches the caregiver phone in Hindi, and they acknowledge.
8. **2:40** SOS (test mode): countdown ring, then "Daughter is going ✓", the 108 button, and the Emergency Card QR.
9. **2:55** Close: "Zero-Guess: wrong-but-Verified = 0 across N sample prescriptions."

