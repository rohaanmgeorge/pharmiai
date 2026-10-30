-- PharmiAI 0010: keep the assistant conversation (chat + voice) so it is there next time.
-- Run once in Supabase → SQL Editor, after 0009.
-- Private to the person who chatted (RLS). "Clear history" and "Delete my data" remove it.

create table public.chat_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade, -- whose medicines it was about
  role text not null check (role in ('user', 'assistant')),
  text text not null check (length(text) <= 4000),
  cards jsonb not null default '[]',
  general boolean not null default false,
  lang text not null default 'en',
  created_at timestamptz not null default now()
);
create index chat_messages_user on public.chat_messages (user_id, created_at desc);

alter table public.chat_messages enable row level security;
create policy "read own chat" on public.chat_messages for select to authenticated using (user_id = auth.uid());
create policy "add own chat" on public.chat_messages for insert to authenticated
  with check (user_id = auth.uid() and public.can_view(patient_id));
create policy "clear own chat" on public.chat_messages for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.chat_messages to authenticated;
grant all on public.chat_messages to service_role;
