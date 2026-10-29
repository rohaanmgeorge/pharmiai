# Status

_Last updated: 2026-10-29 23:55 IST_

## Done
- Planning docs: `PLAN.md`, `DESIGN.md`, `CLAUDE.md`, `docs/NEEDS.md`.
- **Complete UI design built as the real Next.js app, using fictional demo data (no backend yet).**
  - Screens:
    - `/` onboarding
    - `/chat`
    - `/voice`
    - `/scan`
    - `/review`
    - `/today`
    - `/meds/[id]`
    - `/savings`
    - `/family`
    - `/family/[id]`
    - `/contacts`
    - `/sos`
    - `/card/[token]`
    - `/elder`
    - `/more`
    - `/settings`
    - `/states` (gallery of the loading, empty, error and offline states)
  - Design tokens are in `app/globals.css`, matching `DESIGN.md`. Shared components are in `components/`.
  - Features that already work for real:
    - The Voice Mode microphone waveform reacts to sound (Web Audio).
    - Speech-to-text uses the browser's Web Speech API, with a scripted demo when it isn't available.
    - Text-to-speech uses the phone's own voice.
    - The scanner opens the phone camera.
    - The emergency card shows a real QR code.
  - Also working: languages (EN/ML/HI), Elder mode, and the SOS button on every screen.
- Checked: `tsc`, `eslint` and `next build` all pass. All routes return 200. Headless screenshots at 390px (phone) and 1280px (laptop) show no sideways scrolling.

## Issues / notes
- `gh` and `vercel` are not installed yet. The Supabase, Anthropic and Google Cloud accounts are still pending (see `docs/NEEDS.md`).
- Next 16 build issue we hit: a URL hook (`usePathname`) inside `<Suspense>` in the shell made the server re-render forever. Fix: `cacheComponents` is off and URL hooks are used directly.
- Malayalam and Hindi strings in `lib/i18n.ts` are drafts. Person B must review them.
- Nothing is committed yet.

## Next step
- P0: install `gh`, first commit and push, import into Vercel, open the deployed URL on a phone.
- P1: Supabase schema + RLS, then wire scan → review → approve to the real Zero-Guess pipeline. This replaces `lib/mock.ts` one screen at a time.
