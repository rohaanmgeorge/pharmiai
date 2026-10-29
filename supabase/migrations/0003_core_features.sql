-- PharmiAI: everything after the scan pipeline (PLAN.md §16).
-- Run once in Supabase → SQL Editor, after 0001 and 0002. Safe to read top to bottom:
-- every new table has RLS ON and explicit grants, like 0001.

-- ============================================================================
-- Prescriptions: keep both readings per line (needed to re-check on confirm),
-- doctor name (only after a person confirms it), and who approved.
-- ============================================================================
alter table public.prescription_items
  add column if not exists reading_a jsonb,
  add column if not exists reading_b jsonb;

alter table public.prescriptions
  add column if not exists doctor_name text,
  add column if not exists doctor_read text,          -- what reading A saw; shown for the person to confirm
  add column if not exists approved_by uuid references public.profiles (id),
  add column if not exists approved_at timestamptz;

-- ============================================================================
-- Profile care settings (defaults agreed in PLAN.md §16)
-- ============================================================================
create type public.presence as enum ('home', 'away', 'hospital');

alter table public.profiles
  add column if not exists email text,
  add column if not exists pharmacy_name text,
  add column if not exists pharmacy_phone text,
  add column if not exists pharmacy_email text,
  add column if not exists refill_days int not null default 5 check (refill_days between 1 and 30),
  add column if not exists expiry_alert_days int[] not null default '{30,7,0}',
  add column if not exists check_missed int not null default 2 check (check_missed between 1 and 10),
  add column if not exists check_idle_hours int not null default 3 check (check_idle_hours between 1 and 24),
  add column if not exists check_wait_min int not null default 15 check (check_wait_min between 1 and 120),
  add column if not exists quiet_start time not null default '22:00',
  add column if not exists quiet_end time not null default '07:00',
  add column if not exists presence public.presence not null default 'home',
  add column if not exists check_consent boolean not null default false,
  add column if not exists check_consent_by uuid references public.profiles (id),
  add column if not exists last_activity_at timestamptz not null default now();

-- Keep a copy of the email so caregivers can be invited by email.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email) values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''), lower(new.email));
  return new;
end $$;
update public.profiles p set email = lower(u.email) from auth.users u where u.id = p.id and p.email is null;

-- Caregivers (can_manage) may change care settings for the elder; only the elder or a
-- managing caregiver may switch the "Are you okay?" check on. Other columns stay own-row only.
create policy "caregiver updates care settings" on public.profiles for update to authenticated
  using (public.can_manage(id)) with check (public.can_manage(id));

create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and auth.uid() <> new.id then
    -- A caregiver may only touch care settings, never identity or medical fields.
    if new.name is distinct from old.name or new.lang is distinct from old.lang or new.blood_group is distinct from old.blood_group
       or new.allergies is distinct from old.allergies or new.conditions is distinct from old.conditions or new.email is distinct from old.email then
      raise exception 'Caregivers can only change care settings';
    end if;
  end if;
  if new.check_consent and not old.check_consent then new.check_consent_by := auth.uid(); end if;
  return new;
end $$;
create trigger guard_profile before update on public.profiles for each row execute function public.guard_profile();

-- Invite a family member by email. Returns the new link id (consent starts as pending).
create or replace function public.invite_member(p_email text, p_role public.circle_role) returns uuid
language plpgsql security definer set search_path = public as $$
declare m uuid; link uuid;
begin
  select id into m from public.profiles where email = lower(trim(p_email));
  if m is null then raise exception 'No PharmiAI account with that email yet'; end if;
  if m = auth.uid() then raise exception 'You cannot invite yourself'; end if;
  insert into public.care_circle_members (patient_id, member_id, role, invited_by)
  values (auth.uid(), m, p_role, auth.uid())
  on conflict (patient_id, member_id) do update set role = excluded.role
  returning id into link;
  return link;
end $$;

-- ============================================================================
-- Medicine strips: medicine scan + expiry (Zero-Guess: two readings + a person confirms)
-- ============================================================================
create table public.strips (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  created_by uuid not null references public.profiles (id),
  image_path text not null,
  reading_a jsonb,
  reading_b jsonb,
  catalog_id text references public.medicine_catalog (id),
  candidates jsonb not null default '[]',
  status public.item_status not null default 'needs_check',
  reasons text[] not null default '{}',
  expiry_read text,                         -- "YYYY-MM" both readings agreed on (null = unclear)
  expiry_month date,                        -- first day of the confirmed month; null until a person confirms
  batch text,
  quantity int check (quantity is null or quantity between 0 and 1000),
  schedule_id uuid references public.schedules (id) on delete set null,
  state text not null default 'in_use' check (state in ('in_use', 'finished', 'expired')),
  finished_at timestamptz,
  confirmed_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint strip_verified_is_complete check (
    status <> 'verified' or (catalog_id is not null and expiry_month is not null and confirmed_by is not null)
  )
);
create index strips_patient on public.strips (patient_id, expiry_month);

-- ============================================================================
-- Refill agent
-- ============================================================================
create table public.refill_suggestions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  schedule_id uuid not null references public.schedules (id) on delete cascade,
  days_left int not null,
  runout_date date not null,
  draft_text text,
  lang public.lang not null default 'en',
  state text not null default 'open' check (state in ('open', 'later', 'approved', 'refilled', 'dismissed')),
  later_until timestamptz,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  refilled_qty int,
  refilled_by uuid references public.profiles (id),
  refilled_at timestamptz,
  created_at timestamptz not null default now()
);
-- Only one open suggestion per medicine at a time.
create unique index one_open_refill on public.refill_suggestions (schedule_id) where state in ('open', 'later', 'approved');

-- ============================================================================
-- "Are you okay?" check and its alerts
-- ============================================================================
create table public.wellness_checks (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  trigger_dose_id uuid references public.dose_events (id) on delete set null,
  state text not null default 'asking' check (state in ('asking', 'escalating', 'ok', 'acknowledged', 'sos', 'stopped')),
  level int not null default 0,
  last_step_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references public.profiles (id)
);
create unique index one_open_check on public.wellness_checks (patient_id) where state in ('asking', 'escalating');

create table public.check_alerts (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.wellness_checks (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  level int not null,
  member_id uuid references public.profiles (id) on delete cascade,
  contact_id uuid references public.emergency_contacts (id) on delete cascade,
  channel text not null check (channel in ('push', 'link')),
  sent_at timestamptz not null default now(),
  ack text check (ack in ('checking', 'reached')),
  acked_by uuid references public.profiles (id),
  acked_at timestamptz
);

-- ============================================================================
-- SOS: each contact gets a private link to say "I'm going" (they may not have the app)
-- ============================================================================
alter table public.sos_acks alter column acked_at drop not null;
alter table public.sos_acks alter column acked_at drop default;
alter table public.sos_acks add column if not exists token text unique default replace(gen_random_uuid()::text, '-', '');
alter table public.sos_acks add column if not exists notified_at timestamptz not null default now();

-- ============================================================================
-- Idempotency for every scheduled message: a key is inserted once, so a message is sent once.
-- e.g. 'dose:<id>', 'expiry:<strip>:30', 'refill:<schedule>:<date>', 'check:<id>:L2'
-- ============================================================================
create table public.sent_notifications (
  key text primary key,
  sent_at timestamptz not null default now()
);

-- ============================================================================
-- Activity: any dose action counts as activity and ends an open "Are you okay?" check.
-- ============================================================================
create or replace function public.act_on_dose(p_event uuid, p_action text, p_op uuid)
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
  if auth.uid() = ev.patient_id then
    update public.profiles set last_activity_at = now() where id = ev.patient_id;
    update public.wellness_checks set state = 'ok', ended_at = now(), ended_by = auth.uid()
      where patient_id = ev.patient_id and state in ('asking', 'escalating');
  end if;
  return ev;
end $$;

-- ============================================================================
-- Row Level Security for the new tables
-- ============================================================================
alter table public.strips enable row level security;
alter table public.refill_suggestions enable row level security;
alter table public.wellness_checks enable row level security;
alter table public.check_alerts enable row level security;
alter table public.sent_notifications enable row level security; -- no policies: server only

-- Read: anyone in the consented circle. Writes go through our API (server checks can_manage,
-- then writes with the admin client), so status / expiry can never be set by a client.
create policy "view strips" on public.strips for select to authenticated using (public.can_view(patient_id));
create policy "view refills" on public.refill_suggestions for select to authenticated using (public.can_view(patient_id));
create policy "view checks" on public.wellness_checks for select to authenticated using (public.can_view(patient_id));
create policy "view check alerts" on public.check_alerts for select to authenticated using (public.can_view(patient_id));

grant select on public.strips, public.refill_suggestions, public.wellness_checks, public.check_alerts to authenticated;
grant all on public.strips, public.refill_suggestions, public.wellness_checks, public.check_alerts, public.sent_notifications to service_role;
grant execute on function public.invite_member(text, public.circle_role) to authenticated;
grant execute on function public.act_on_dose(uuid, text, uuid) to authenticated;

-- ============================================================================
-- Live updates (Supabase Realtime). Realtime applies each table's RLS to every subscriber,
-- so people only receive rows they are allowed to see.
-- ============================================================================
alter publication supabase_realtime add table
  public.dose_events, public.strips, public.refill_suggestions, public.wellness_checks,
  public.check_alerts, public.sos_events, public.sos_acks;
