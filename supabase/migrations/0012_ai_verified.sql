-- PharmiAI 0012: medicines identified by AI are Verified automatically (team decision 2026-10-30).
-- Run once in Supabase → SQL Editor, after 0011.
--
-- verified_by = 'ai'     → set by the scan (two readings + Gemini identification), no person tapped confirm
-- verified_by = 'person' → confirmed or entered by a person (as before)
-- ai_notes keeps what the app noticed (e.g. "the two readings differed") so it stays visible.

alter table public.prescription_items
  add column if not exists verified_by text not null default 'person' check (verified_by in ('person', 'ai')),
  add column if not exists ai_notes text[] not null default '{}';

-- AI-verified rows need the medicine; dose or days may be missing (then no reminder / an open-ended one).
alter table public.prescription_items drop constraint if exists verified_is_complete;
alter table public.prescription_items add constraint verified_is_complete check (
  status <> 'verified' or (
    catalog_id is not null and strength is not null and (
      verified_by = 'ai' or (dose_code is not null and duration_days is not null and confirmed_by is not null and confirmed_at is not null)
    )
  )
);

alter table public.strips
  add column if not exists verified_by text not null default 'person' check (verified_by in ('person', 'ai'));
alter table public.strips drop constraint if exists strip_verified_is_complete;
alter table public.strips add constraint strip_verified_is_complete check (
  status <> 'verified' or (catalog_id is not null and (verified_by = 'ai' or (expiry_month is not null and confirmed_by is not null)))
);
