-- The team switched from Claude to Gemini: label readings by engine accurately in the log.
alter table public.readings drop constraint readings_engine_check;
alter table public.readings add constraint readings_engine_check
  check (engine in ('gemini_a', 'gemini_b', 'gcv', 'claude'));
