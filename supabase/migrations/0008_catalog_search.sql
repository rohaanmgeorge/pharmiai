-- PharmiAI 0008: a big medicine catalog (public dataset import) that stays fast and safe.
-- Run once in Supabase → SQL Editor, after 0001–0003 and 0007.
--
-- Why: the API returns at most 1,000 rows per query, and loading 200k medicines on every scan
-- would be slow. Instead the server asks the database only for the rows that could match
-- what was read: exact names plus every look-alike within 2 letters (same rule as
-- lib/safety/match.ts). The Zero-Guess decision itself still happens in code.

create extension if not exists fuzzystrmatch with schema extensions;

-- Same normalisation as normalizeName() in lib/safety/match.ts: lower case, drop form words
-- (tab, cap, syrup…), keep only letters/digits/spaces.
create or replace function public.pharmi_norm(raw text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(lower(coalesce(raw, '')), '\m(tab|tabs|tablet|tb|cap|caps|capsule|syp|syrup|inj)\M\.?', ' ', 'g'),
      '[^a-z0-9 ]', ' ', 'g'),
    '\s+', ' ', 'g'));
$$;

-- Where each row came from. Hand-checked rows stay "reviewed"; dataset rows are labelled.
alter table public.medicine_catalog
  add column if not exists manufacturer text,
  add column if not exists pack_label text,
  add column if not exists reviewed boolean not null default false,
  add column if not exists source_kind text not null default 'reviewed' check (source_kind in ('reviewed', 'dataset', 'demo')),
  add column if not exists name_norm text generated always as (public.pharmi_norm(name)) stored,
  add column if not exists name_letters text generated always as (regexp_replace(public.pharmi_norm(name), '[0-9 ]', '', 'g')) stored,
  add column if not exists name_first text generated always as (split_part(public.pharmi_norm(name), ' ', 1)) stored;

update public.medicine_catalog set source_kind = 'demo', reviewed = true where source like 'DEMO%';

create index if not exists catalog_name_norm on public.medicine_catalog (name_norm);
create index if not exists catalog_name_first on public.medicine_catalog (name_first);
create index if not exists catalog_norm_len on public.medicine_catalog (length(name_norm));
create index if not exists catalog_letters_len on public.medicine_catalog (length(name_letters));

-- Every catalog row that could match one of these written names: exact, or a look-alike
-- (≤2 letter edits on the full name or on the letters-only name). Never more than 300 rows.
create or replace function public.catalog_candidates(p_keys text[])
returns table (id text, name text, ingredients text[], strength text)
language sql stable set search_path = public, extensions as $$
  with k as (
    select distinct public.pharmi_norm(x) as n, regexp_replace(public.pharmi_norm(x), '[0-9 ]', '', 'g') as l
    from unnest(p_keys) as x
    where length(public.pharmi_norm(x)) > 0
  )
  select distinct c.id, c.name, c.ingredients, c.strength
  from public.medicine_catalog c
  join k on c.name_norm = k.n
    or (length(c.name_norm) between length(k.n) - 2 and length(k.n) + 2 and levenshtein(c.name_norm, k.n) <= 2)
    or (length(k.l) >= 3 and length(c.name_letters) between length(k.l) - 2 and length(k.l) + 2 and levenshtein(c.name_letters, k.l) <= 2)
  limit 300;
$$;

-- Catalog names whose first word appears in a piece of text (for the voice and refill guards,
-- which must spot medicine names the AI was not given).
create or replace function public.catalog_names_in(p_text text)
returns setof text
language sql stable set search_path = public as $$
  select c.name from public.medicine_catalog c
  where c.name_first = any (string_to_array(public.pharmi_norm(p_text), ' '))
    and length(c.name_first) >= 3
  limit 500;
$$;

grant execute on function public.pharmi_norm(text) to authenticated, service_role;
grant execute on function public.catalog_candidates(text[]) to authenticated, service_role;
grant execute on function public.catalog_names_in(text) to authenticated, service_role;
