-- PharmiAI 0009: add a medicine by hand (no prescription photo), e.g. when the doctor said it aloud.
-- Run once in Supabase → SQL Editor, after 0008.
--
-- Zero-Guess still holds: the person picks the exact medicine from our database (never free
-- text), chooses the dose from the fixed shorthand table, and types the days. That is a person
-- confirming every field, so the item is Verified and gets reminders like a scanned one.

alter table public.prescriptions alter column image_path drop not null;
alter table public.prescriptions add column if not exists source text not null default 'scan' check (source in ('scan', 'manual'));
alter table public.prescription_items add column if not exists entry text not null default 'scan' check (entry in ('scan', 'manual'));

-- Search the medicine database by name as the person types ("dolo", "augm"): starts-with first.
create or replace function public.catalog_search(p_query text)
returns table (id text, name text, ingredients text[], strength text, form text, manufacturer text, reviewed boolean)
language sql stable set search_path = public as $$
  with q as (select public.pharmi_norm(p_query) as n)
  select c.id, c.name, c.ingredients, c.strength, c.form, c.manufacturer, c.reviewed
  from public.medicine_catalog c, q
  where length(q.n) >= 2 and (c.name_norm like q.n || '%' or c.name_norm like '% ' || q.n || '%')
  order by (c.name_norm like q.n || '%') desc, length(c.name), c.name
  limit 20;
$$;

grant execute on function public.catalog_search(text) to authenticated, service_role;
