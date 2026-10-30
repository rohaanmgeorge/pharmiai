-- PharmiAI 0007: let "Delete my data" work for caregivers too.
-- Run after 0001–0003 (Supabase → SQL Editor, or `npx supabase db push`).
--
-- Why: columns like prescriptions.uploaded_by or dose_events.acted_by point at the person who
-- DID something. If a caregiver did something for someone else (e.g. uploaded Amma's
-- prescription), deleting the caregiver's account was blocked by these links.
-- Now the "who did it" link is cleared (set null) and the patient's own records stay.
-- Constraint names are unchanged, so existing `profiles!<name>` joins keep working.

-- Helper pattern: drop the link, then add it back with "on delete set null".
alter table public.prescriptions alter column uploaded_by drop not null;
alter table public.prescriptions drop constraint if exists prescriptions_uploaded_by_fkey,
  add constraint prescriptions_uploaded_by_fkey foreign key (uploaded_by) references public.profiles (id) on delete set null;
alter table public.prescriptions drop constraint if exists prescriptions_approved_by_fkey,
  add constraint prescriptions_approved_by_fkey foreign key (approved_by) references public.profiles (id) on delete set null;

alter table public.care_circle_members alter column invited_by drop not null;
alter table public.care_circle_members drop constraint if exists care_circle_members_invited_by_fkey,
  add constraint care_circle_members_invited_by_fkey foreign key (invited_by) references public.profiles (id) on delete set null;

alter table public.profiles drop constraint if exists profiles_check_consent_by_fkey,
  add constraint profiles_check_consent_by_fkey foreign key (check_consent_by) references public.profiles (id) on delete set null;

alter table public.dose_events drop constraint if exists dose_events_acted_by_fkey,
  add constraint dose_events_acted_by_fkey foreign key (acted_by) references public.profiles (id) on delete set null;

alter table public.dose_actions alter column actor drop not null;
alter table public.dose_actions drop constraint if exists dose_actions_actor_fkey,
  add constraint dose_actions_actor_fkey foreign key (actor) references public.profiles (id) on delete set null;

alter table public.escalations drop constraint if exists escalations_member_id_fkey,
  add constraint escalations_member_id_fkey foreign key (member_id) references public.profiles (id) on delete set null;

alter table public.strips alter column created_by drop not null;
alter table public.strips drop constraint if exists strips_created_by_fkey,
  add constraint strips_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null;

alter table public.refill_suggestions drop constraint if exists refill_suggestions_approved_by_fkey,
  add constraint refill_suggestions_approved_by_fkey foreign key (approved_by) references public.profiles (id) on delete set null;
alter table public.refill_suggestions drop constraint if exists refill_suggestions_refilled_by_fkey,
  add constraint refill_suggestions_refilled_by_fkey foreign key (refilled_by) references public.profiles (id) on delete set null;

alter table public.wellness_checks drop constraint if exists wellness_checks_ended_by_fkey,
  add constraint wellness_checks_ended_by_fkey foreign key (ended_by) references public.profiles (id) on delete set null;

alter table public.check_alerts drop constraint if exists check_alerts_acked_by_fkey,
  add constraint check_alerts_acked_by_fkey foreign key (acked_by) references public.profiles (id) on delete set null;

-- confirmed_by is special: a Verified row MUST keep a confirmer (Zero-Guess check constraint),
-- so we cannot set it to null. We keep the id as a plain audit value (like safety_log) and
-- only remove the link that would block deletion.
alter table public.prescription_items drop constraint if exists prescription_items_confirmed_by_fkey;
alter table public.strips drop constraint if exists strips_confirmed_by_fkey;
