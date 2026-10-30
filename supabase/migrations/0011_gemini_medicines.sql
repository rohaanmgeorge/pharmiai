-- PharmiAI 0011: medicines are identified by Gemini instead of a downloaded dataset.
-- Run once in Supabase → SQL Editor, after 0010.
--
-- What changes:
--   * The Kaggle brand dataset is removed (rows still used by someone's reminders are kept).
--   * Each medicine Gemini identifies is saved once as source_kind = 'ai' and labelled
--     "AI, not pharmacist-reviewed", so the next scan of the same medicine needs no AI call.
--   * Profiles get a city, used for AI price estimates ("location-specific rates").
-- Kept: hand-checked/demo rows and the official Jan Aushadhi price list (generic_products).

alter table public.medicine_catalog drop constraint if exists medicine_catalog_source_kind_check;
alter table public.medicine_catalog add constraint medicine_catalog_source_kind_check
  check (source_kind in ('reviewed', 'dataset', 'demo', 'ai'));

alter table public.medicine_catalog add column if not exists price_note text; -- e.g. "AI estimate for Kochi, Oct 2026"

-- Remove the dataset, except rows that existing prescriptions or strips point to.
delete from public.medicine_catalog c
where c.source_kind = 'dataset'
  and not exists (select 1 from public.prescription_items i where i.catalog_id = c.id)
  and not exists (select 1 from public.strips s where s.catalog_id = c.id);

alter table public.profiles add column if not exists city text check (city is null or length(city) <= 80);
