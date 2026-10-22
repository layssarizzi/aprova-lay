-- Aprova Lay / Etapa 1
-- Safe to re-run: tables/indexes use IF NOT EXISTS and contest seeds use upsert.
create extension if not exists pgcrypto;

create table if not exists public.contests (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  role text not null,
  institution text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  name text not null,
  exam_date date,
  status text not null default 'planned' check (status in ('planned', 'active', 'completed')),
  created_at timestamptz not null default now()
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contest_id uuid not null references public.contests(id) on delete restrict,
  exam_id uuid references public.exams(id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0 and duration_seconds <= 43200),
  notes text,
  created_at timestamptz not null default now(),
  constraint study_session_time_order check (ended_at is null or ended_at >= started_at),
  constraint study_session_closed_has_duration check (ended_at is null or duration_seconds > 0)
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  exam_id uuid references public.exams(id) on delete set null,
  subject text,
  topic text,
  prompt text not null,
  source_label text,
  created_at timestamptz not null default now()
);

create table if not exists public.question_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  contest_id uuid not null references public.contests(id) on delete restrict,
  is_correct boolean,
  answered_at timestamptz not null default now(),
  response_note text
);

create table if not exists public.auth_login_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists exams_contest_id_idx on public.exams(contest_id);
create index if not exists study_sessions_user_started_idx on public.study_sessions(user_id, started_at desc);
create index if not exists study_sessions_user_contest_idx on public.study_sessions(user_id, contest_id);
create index if not exists question_attempts_user_answered_idx on public.question_attempts(user_id, answered_at desc);
create index if not exists question_attempts_user_contest_idx on public.question_attempts(user_id, contest_id);
create index if not exists questions_contest_id_idx on public.questions(contest_id);
create index if not exists auth_login_attempts_ip_time_idx on public.auth_login_attempts(ip_hash, attempted_at desc);

alter table public.contests enable row level security;
alter table public.exams enable row level security;
alter table public.study_sessions enable row level security;
alter table public.questions enable row level security;
alter table public.question_attempts enable row level security;
alter table public.auth_login_attempts enable row level security;

-- Explicit grants complement RLS; RLS remains the row-level security boundary.
grant select on public.contests, public.exams, public.questions to authenticated;
grant select, insert, update, delete on public.study_sessions, public.question_attempts to authenticated;

-- Contest catalog is read-only to signed-in users.
drop policy if exists "authenticated users can read contests" on public.contests;
create policy "authenticated users can read contests"
  on public.contests for select to authenticated using (true);

drop policy if exists "authenticated users can read exams" on public.exams;
create policy "authenticated users can read exams"
  on public.exams for select to authenticated using (true);

drop policy if exists "users can read own sessions" on public.study_sessions;
create policy "users can read own sessions"
  on public.study_sessions for select to authenticated using (auth.uid() = user_id);
drop policy if exists "users can create own sessions" on public.study_sessions;
create policy "users can create own sessions"
  on public.study_sessions for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "users can update own sessions" on public.study_sessions;
create policy "users can update own sessions"
  on public.study_sessions for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users can delete own sessions" on public.study_sessions;
create policy "users can delete own sessions"
  on public.study_sessions for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "authenticated users can read questions" on public.questions;
create policy "authenticated users can read questions"
  on public.questions for select to authenticated using (true);

drop policy if exists "users can read own question attempts" on public.question_attempts;
create policy "users can read own question attempts"
  on public.question_attempts for select to authenticated using (auth.uid() = user_id);
drop policy if exists "users can create own question attempts" on public.question_attempts;
create policy "users can create own question attempts"
  on public.question_attempts for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "users can update own question attempts" on public.question_attempts;
create policy "users can update own question attempts"
  on public.question_attempts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users can delete own question attempts" on public.question_attempts;
create policy "users can delete own question attempts"
  on public.question_attempts for delete to authenticated using (auth.uid() = user_id);

-- No client-side policies on rate-limit data. Edge Function uses service_role only.
revoke all on public.auth_login_attempts from anon, authenticated;
grant all on public.auth_login_attempts to service_role;

create or replace function public.check_password_login_rate_limit(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_attempts integer;
begin
  delete from public.auth_login_attempts
    where attempted_at < now() - interval '24 hours';

  select count(*)::integer into recent_attempts
    from public.auth_login_attempts
    where ip_hash = p_ip_hash
      and attempted_at > now() - interval '15 minutes';

  if recent_attempts >= 10 then
    return false;
  end if;

  insert into public.auth_login_attempts(ip_hash) values (p_ip_hash);
  return true;
end;
$$;

revoke all on function public.check_password_login_rate_limit(text) from public, anon, authenticated;
grant execute on function public.check_password_login_rate_limit(text) to service_role;

insert into public.contests (slug, name, role, institution) values
  ('transpetro', 'Transpetro', 'Analista de Sistemas/TI', 'Transpetro'),
  ('seplag-rj', 'SEPLAG-RJ', 'Analista de Planejamento e Orçamento — Tecnologia da Informação', 'SEPLAG-RJ'),
  ('cremerj', 'CREMERJ', 'Analista de Ciência e Análise de Dados', 'CREMERJ')
on conflict (slug) do update set
  name = excluded.name,
  role = excluded.role,
  institution = excluded.institution;
