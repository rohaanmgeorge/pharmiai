# What we need from you

Never paste keys into chat, code, or commits. Keys go only in `.env.local` (gitignored) and Vercel → Project → Settings → Environment Variables.

| Item | Who | Time | Needed by |
|---|---|---|---|
| Anthropic API key (console.anthropic.com → API Keys; add $5 credit) → Vercel env + `.env.local` only | A | 10m | 23:00 |
| Google Cloud project + billing + enable Vision API + API key restricted to Vision API | A | 20m | 00:30 |
| Supabase project (Mumbai), save URL, publishable (anon) key, secret (service role) key; enable `pg_cron`, `pg_net` | A | 15m | 23:15 |
| Resend account + API key (use `onboarding@resend.dev` sender for demo) | A | 10m | 06:30 |
| GitHub login (`! gh auth login`), Vercel account linked to GitHub | A | 10m | 23:00 |
| `supabase/seed/medicine_catalog.csv`: `brand,ingredients(semicolon "Metformin:500mg"),strength,form,mrp,pack_size,uses_en,uses_ml,uses_hi,side_effects_en,side_effects_ml,side_effects_hi,source,reviewer`. Sources: CDSCO, the National Formulary of India (IPC), and the manufacturer's package insert | B | 3h | 01:30 (first 10 rows by 00:00) |
| `generic_products.csv`: `ja_code,name,ingredients,strength,mrp,pack_size` from the PMBJP/Jan Aushadhi product list (janaushadhi.gov.in) | B | 1h | 06:30 |
| Brand prices: the `mrp` column in the catalog (from the strip/pack label or the manufacturer's site) | B | incl. | 06:30 |
| `shorthand.csv`: `code,slots,times_per_day,as_needed,meaning_en,meaning_ml,meaning_hi` (I'll pre-fill it; B reviews) | B | 20m | 01:00 |
| Sample prescriptions in `data/private/prescriptions/rx01.jpg` + `rx01.truth.json` `{items:[{brand,strength,dose_code,duration_days,timing}]}`, with names and faces removed | B | 1.5h | 04:00 |
| Translations `lib/i18n/{ml,hi}.json` (I'll draft; B or a fluent friend reviews medical text) | B | 1h | 08:00 |
| MP3 fallback phrases (list provided) | B | 45m | 09:00 |
| 2 test phones (Android Chrome required) | A+B | — | 05:00 |


## Environment variables (names only — values never committed)
| Name | Where it's used | Secret? |
|---|---|---|
| `ANTHROPIC_API_KEY` | server only | yes |
| `GOOGLE_VISION_API_KEY` | server only (key restricted to Cloud Vision API) | yes |
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server (RLS protects data) | no |
| `SUPABASE_SERVICE_ROLE_KEY` | `/api/cron/tick` only | **yes** |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | push (generate with `npx web-push generate-vapid-keys`) | private = yes |
| `RESEND_API_KEY` | server only | yes |
| `CRON_SECRET` | `/api/cron/tick` + Supabase Vault (generate with `openssl rand -hex 32`) | yes |

## GitHub + Vercel setup (Person A, P0)
Run in the project folder (in Claude Code, prefix with `!`):
1. `brew install gh` → `gh auth login` (GitHub.com → HTTPS → login with browser). Verify: `gh auth status`.
2. First commit + push (Claude does this after you approve): `git add -A && git commit -m "Initial plan" && git push -u origin main`. Verify: `gh repo view --web`.
3. Vercel: vercel.com → sign in with GitHub → **Add New → Project → Import** `pharmiai` → Framework: Next.js → add env vars above → Deploy. Every push to `main` now deploys. Verify: open the `*.vercel.app` URL on your phone.
4. Supabase: supabase.com → New project → region **Mumbai (ap-south-1)** → save DB password in a password manager. Database → Extensions → enable `pg_cron`, `pg_net`. Project Settings → API → copy URL + keys into `.env.local` and Vercel.

## Fallback voice phrases to record (Malayalam + Hindi, ~3 s each, MP3)
Time for your medicine · Did you take it? · Marked as taken · Skipped · I'll remind you in 10 minutes · I'm not sure, please ask your doctor or pharmacist · I can't give dose advice · Calling for help in 5 seconds · Help is on the way · Your family has been informed · Please say that again · Your stock is running low · Your course is complete · Good morning · Voice is not available, please read the screen
