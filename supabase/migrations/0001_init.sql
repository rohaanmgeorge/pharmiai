-- PharmiAI database: tables, access rules (RLS) and Zero-Guess safety guards.
-- Run once in Supabase → SQL Editor (or `npx supabase db push`).
--
-- Access model:
--   * Every table has Row Level Security ON. Nothing is visible unless a policy allows it.
--   * "anon" (not logged in) gets nothing. The public Emergency Card is served by our server.
--   * Medicine status and the safety log can ONLY be written by the server (service_role).

-- ============================================================================
-- Types
-- ============================================================================
create type public.lang as enum ('en', 'ml', 'hi');
create type public.circle_role as enum ('caregiver', 'viewer');
create type public.consent_state as enum ('pending', 'given', 'revoked');
create type public.item_status as enum ('verified', 'needs_check', 'not_recognized');
create type public.dose_state as enum ('pending', 'taken', 'skipped', 'snoozed', 'missed');
create type public.slot as enum ('morning', 'afternoon', 'night');

-- ============================================================================
-- People
-- ============================================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  lang public.lang not null default 'en',
  elder_mode boolean not null default false,
  tz text not null default 'Asia/Kolkata',
  blood_group text,
  allergies text[] not null default '{}',
  conditions text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- A profile row is created automatically when someone signs up.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name) values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create table public.care_circle_members (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  role public.circle_role not null,
  consent public.consent_state not null default 'pending',
  invited_by uuid not null references public.profiles (id),
  consented_at timestamptz,
  created_at timestamptz not null default now(),
  unique (patient_id, member_id),
  check (patient_id <> member_id)
);

-- ============================================================================
-- Access helpers (security definer so policies don't recurse into each other)
-- ============================================================================
create function public.can_view(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p = auth.uid() or exists (
    select 1 from public.care_circle_members m
    where m.patient_id = p and m.member_id = auth.uid() and m.consent = 'given'
  );
$$;

create function public.can_manage(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p = auth.uid() or exists (
    select 1 from public.care_circle_members m
    where m.patient_id = p and m.member_id = auth.uid() and m.consent = 'given' and m.role = 'caregiver'
  );
$$;

-- Only the patient (the elder) can give or revoke consent — never the person invited.
create function public.guard_consent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.consent is distinct from old.consent and auth.uid() <> new.patient_id then
    raise exception 'Only the patient can change consent';
  end if;
  if new.consent = 'given' and old.consent <> 'given' then new.consented_at := now(); end if;
  return new;
end $$;

create trigger guard_consent before update on public.care_circle_members
for each row execute function public.guard_consent();

-- ============================================================================
-- Reference data (curated, read-only for users; imported by the team)
-- ============================================================================
create table public.medicine_catalog (
  id text primary key,                  -- e.g. 'glyconil-500'
  name text not null unique,            -- as printed, e.g. 'Glyconil 500'
  ingredients text[] not null,          -- lower-case, e.g. {metformin}
  strength text not null,               -- e.g. '500 mg'
  form text not null default 'Tablet',
  mrp numeric(10, 2),                   -- brand price per pack
  pack_size int,
  uses_en text, uses_ml text, uses_hi text,
  side_effects_en text, side_effects_ml text, side_effects_hi text,
  source text not null,                 -- where the facts came from
  reviewer text not null,               -- who checked them
  reviewed_at date not null default current_date
);

create table public.generic_products (
  ja_code text primary key,             -- Jan Aushadhi product code
  name text not null,
  ingredients text[] not null,
  strength text not null,
  mrp numeric(10, 2) not null,
  pack_size int not null
);

-- ============================================================================
-- Prescriptions and the Zero-Guess pipeline
-- ============================================================================
create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id),
  image_path text not null,             -- path inside the private 'rx-images' bucket
  state text not null default 'draft' check (state in ('draft', 'approved')),
  created_at timestamptz not null default now()
);

create table public.readings (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions (id) on delete cascade,
  engine text not null check (engine in ('claude', 'gcv')),
  raw jsonb not null,
  created_at timestamptz not null default now()
);

create table public.prescription_items (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  text_a text,                          -- what reading A saw (null = unreadable)
  text_b text,                          -- what reading B saw
  catalog_id text references public.medicine_catalog (id),
  candidates jsonb not null default '[]',
  strength text,
  dose_code text,
  duration_days int check (duration_days between 1 and 365),
  food text check (food in ('before', 'after')),
  status public.item_status not null default 'needs_check',
  reasons text[] not null default '{}',
  confirmed_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  -- Database-level Zero-Guess: a Verified row must be complete and confirmed by a person.
  constraint verified_is_complete check (
    status <> 'verified' or (
      catalog_id is not null and strength is not null and dose_code is not null
      and duration_days is not null and confirmed_by is not null and confirmed_at is not null
    )
  )
);

-- ============================================================================
-- Schedules and doses
-- ============================================================================
create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  item_id uuid not null unique references public.prescription_items (id) on delete cascade,
  slot_times time[] not null,
  start_date date not null default current_date,
  end_date date not null,
  stock int not null default 0 check (stock >= 0),
  pill_photo_path text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Zero-Guess guard: reminders can only exist for Verified medicines. Enforced here, not just in the UI.
create function public.require_verified() returns trigger
language plpgsql security definer set search_path = public as $$
declare s public.item_status; p uuid;
begin
  select status, patient_id into s, p from public.prescription_items where id = new.item_id;
  if s is distinct from 'verified' then
    raise exception 'Reminders are only allowed for verified medicines';
  end if;
  if p <> new.patient_id then
    raise exception 'Schedule patient does not match the prescription';
  end if;
  return new;
end $$;

create trigger require_verified before insert or update on public.schedules
for each row execute function public.require_verified();

create table public.dose_events (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  due_at timestamptz not null,
  state public.dose_state not null default 'pending',
  acted_by uuid references public.profiles (id),
  acted_at timestamptz,
  snooze_until timestamptz,
  unique (schedule_id, due_at)
);

-- Every Taken / Skip / Snooze tap, keyed by an ID created on the phone.
-- Replaying the same tap (e.g. after being offline) is a no-op: the op_id already exists.
create table public.dose_actions (
  op_id uuid primary key,
  event_id uuid not null references public.dose_events (id) on delete cascade,
  action text not null check (action in ('taken', 'skipped', 'snoozed')),
  actor uuid not null references public.profiles (id),
  at timestamptz not null default now()
);

create function public.act_on_dose(p_event uuid, p_action text, p_op uuid)
returns public.dose_events
language plpgsql security definer set search_path = public as $$
declare ev public.dose_events;
begin
  select * into ev from public.dose_events where id = p_event;
  if ev.id is null or not public.can_manage(ev.patient_id) then
    raise exception 'Not allowed';
  end if;
  insert into public.dose_actions (op_id, event_id, action, actor) values (p_op, p_event, p_action, auth.uid())
  on conflict (op_id) do nothing;
  if not found then return ev; end if; -- already applied: idempotent

  update public.dose_events set
    state = p_action::public.dose_state,
    acted_by = auth.uid(),
    acted_at = now(),
    snooze_until = case when p_action = 'snoozed' then now() + interval '10 minutes' else null end
  where id = p_event returning * into ev;

  if p_action = 'taken' then
    update public.schedules set stock = greatest(stock - 1, 0) where id = ev.schedule_id;
  end if;
  return ev;
end $$;

-- ============================================================================
-- Family alerts, emergency
-- ============================================================================
create table public.escalations (
  id uuid primary key default gen_random_uuid(),
  dose_event_id uuid not null references public.dose_events (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  level int not null,
  member_id uuid references public.profiles (id),
  channel text not null check (channel in ('push', 'email')),
  sent_at timestamptz not null default now(),
  acked_at timestamptz,
  unique (dose_event_id, level)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  relation text not null check (relation in ('spouse', 'guardian', 'child', 'other')),
  priority int not null default 1,
  lang public.lang not null default 'en'
);

create table public.sos_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  lat double precision,
  lng double precision,
  state text not null default 'active' check (state in ('active', 'cancelled', 'resolved')),
  is_test boolean not null default false,
  started_at timestamptz not null default now()
);

create table public.sos_acks (
  id uuid primary key default gen_random_uuid(),
  sos_id uuid not null references public.sos_events (id) on delete cascade,
  contact_id uuid not null references public.emergency_contacts (id) on delete cascade,
  acked_at timestamptz not null default now(),
  unique (sos_id, contact_id)
);

create table public.emergency_cards (
  patient_id uuid primary key references public.profiles (id) on delete cascade,
  share_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  enabled boolean not null default true
);

-- ============================================================================
-- Safety log: append-only record of every reading and confirmation.
-- IDs and codes only — no names, no images, no free text from prescriptions.
-- ============================================================================
create table public.safety_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  patient_id uuid,
  item_id uuid,
  event text not null,
  payload jsonb not null default '{}'
);

create function public.safety_log_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'safety_log is append-only';
end $$;

create trigger safety_log_no_update before update or delete on public.safety_log
for each row execute function public.safety_log_append_only();
create trigger safety_log_no_truncate before truncate on public.safety_log
for each statement execute function public.safety_log_append_only();

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.care_circle_members enable row level security;
alter table public.medicine_catalog enable row level security;
alter table public.generic_products enable row level security;
alter table public.prescriptions enable row level security;
alter table public.readings enable row level security;
alter table public.prescription_items enable row level security;
alter table public.schedules enable row level security;
alter table public.dose_events enable row level security;
alter table public.dose_actions enable row level security;
alter table public.escalations enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.sos_events enable row level security;
alter table public.sos_acks enable row level security;
alter table public.emergency_cards enable row level security;
alter table public.safety_log enable row level security;

-- profiles
create policy "read own or cared-for profile" on public.profiles for select to authenticated using (public.can_view(id));
create policy "update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- care circle
create policy "patient and member can see the link" on public.care_circle_members for select to authenticated
  using (patient_id = auth.uid() or member_id = auth.uid());
create policy "patient invites" on public.care_circle_members for insert to authenticated
  with check (patient_id = auth.uid() and invited_by = auth.uid() and consent = 'pending');
create policy "patient changes consent" on public.care_circle_members for update to authenticated
  using (patient_id = auth.uid()) with check (patient_id = auth.uid());
create policy "patient or member removes link" on public.care_circle_members for delete to authenticated
  using (patient_id = auth.uid() or member_id = auth.uid());

-- reference data: any signed-in user can read; nobody can write through the API
create policy "read catalog" on public.medicine_catalog for select to authenticated using (true);
create policy "read generics" on public.generic_products for select to authenticated using (true);

-- prescriptions
create policy "view prescriptions" on public.prescriptions for select to authenticated using (public.can_view(patient_id));
create policy "add prescriptions" on public.prescriptions for insert to authenticated
  with check (public.can_manage(patient_id) and uploaded_by = auth.uid());

create policy "view readings" on public.readings for select to authenticated
  using (exists (select 1 from public.prescriptions p where p.id = prescription_id and public.can_view(p.patient_id)));

-- items: read-only for users. Status changes go through the server only.
create policy "view items" on public.prescription_items for select to authenticated using (public.can_view(patient_id));

-- schedules: caregivers/patient may create them, but the require_verified trigger blocks non-verified items.
create policy "view schedules" on public.schedules for select to authenticated using (public.can_view(patient_id));
create policy "create schedules" on public.schedules for insert to authenticated with check (public.can_manage(patient_id));
create policy "update schedules" on public.schedules for update to authenticated
  using (public.can_manage(patient_id)) with check (public.can_manage(patient_id));

-- doses: read here; change only through act_on_dose()
create policy "view doses" on public.dose_events for select to authenticated using (public.can_view(patient_id));
create policy "view dose actions" on public.dose_actions for select to authenticated
  using (exists (select 1 from public.dose_events e where e.id = event_id and public.can_view(e.patient_id)));

create policy "view escalations" on public.escalations for select to authenticated using (public.can_view(patient_id));
create policy "acknowledge escalation" on public.escalations for update to authenticated
  using (public.can_manage(patient_id)) with check (public.can_manage(patient_id));

create policy "own push subscriptions" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "view contacts" on public.emergency_contacts for select to authenticated using (public.can_view(patient_id));
create policy "manage contacts" on public.emergency_contacts for all to authenticated
  using (public.can_manage(patient_id)) with check (public.can_manage(patient_id));

create policy "view sos" on public.sos_events for select to authenticated using (public.can_view(patient_id));
create policy "start sos" on public.sos_events for insert to authenticated with check (patient_id = auth.uid());
create policy "end sos" on public.sos_events for update to authenticated
  using (public.can_manage(patient_id)) with check (public.can_manage(patient_id));
create policy "view sos acks" on public.sos_acks for select to authenticated
  using (exists (select 1 from public.sos_events s where s.id = sos_id and public.can_view(s.patient_id)));

create policy "own emergency card" on public.emergency_cards for all to authenticated
  using (patient_id = auth.uid()) with check (patient_id = auth.uid());

-- safety_log: no policies for users at all → only the server (service_role) can insert; nobody can update/delete.

-- ============================================================================
-- Grants. "Automatically expose new tables" is OFF, so we grant exactly what the app needs.
-- RLS policies above still decide which ROWS each user sees.
-- ============================================================================
grant usage on schema public to authenticated, service_role;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.care_circle_members to authenticated;
grant select on public.medicine_catalog, public.generic_products to authenticated;
grant select, insert on public.prescriptions to authenticated;
grant select on public.readings, public.prescription_items to authenticated;
grant select, insert, update on public.schedules to authenticated;
grant select on public.dose_events, public.dose_actions to authenticated;
grant select, update (acked_at) on public.escalations to authenticated;
grant select, insert, update, delete on public.push_subscriptions, public.emergency_contacts, public.emergency_cards to authenticated;
grant select, insert, update on public.sos_events to authenticated;
grant select on public.sos_acks to authenticated;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Functions: users may call act_on_dose; the rest are used inside policies/triggers.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.can_view(uuid), public.can_manage(uuid) to authenticated;
grant execute on function public.act_on_dose(uuid, text, uuid) to authenticated;

-- safety_log is append-only even for the server.
revoke update, delete, truncate on public.safety_log from service_role, authenticated;

-- ============================================================================
-- Private storage for prescription and pill-strip photos.
-- Files live at '<patient_id>/<file>' so the folder name decides who can see them.
-- ============================================================================
insert into storage.buckets (id, name, public) values ('rx-images', 'rx-images', false)
on conflict (id) do nothing;

create policy "view own or cared-for photos" on storage.objects for select to authenticated
  using (bucket_id = 'rx-images' and public.can_view(((storage.foldername(name))[1])::uuid));
create policy "upload photos for people you manage" on storage.objects for insert to authenticated
  with check (bucket_id = 'rx-images' and public.can_manage(((storage.foldername(name))[1])::uuid));
