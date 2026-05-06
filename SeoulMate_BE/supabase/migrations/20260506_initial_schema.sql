create extension if not exists pgcrypto;

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  nickname varchar(50) not null unique,
  preferred_region varchar(50),
  preferred_category varchar(100),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.public_data (
  id bigserial primary key,
  source_dataset varchar(100),
  source_record_id varchar(150),
  title varchar(255) not null,
  category varchar(100) not null,
  region varchar(50),
  address text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  source varchar(100),
  source_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint uq_public_data_source_record unique (source, source_record_id)
);

create table if not exists public.recommendation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_text text,
  preferred_region varchar(50),
  preferred_category varchar(100),
  budget integer check (budget is null or budget >= 0),
  companion varchar(50),
  transport_mode varchar(30),
  status varchar(20) not null default 'pending'
    check (status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.recommendations (
  id bigserial primary key,
  request_id uuid not null references public.recommendation_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  public_data_id bigint not null references public.public_data(id) on delete cascade,
  course_order integer check (course_order is null or course_order > 0),
  score numeric(5, 2) not null check (score >= 0 and score <= 100),
  reason text,
  travel_minutes integer check (travel_minutes is null or travel_minutes >= 0),
  estimated_cost integer check (estimated_cost is null or estimated_cost >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  constraint uq_recommendations_request_place unique (request_id, public_data_id)
);

create table if not exists public.saved_courses (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null references public.recommendation_requests(id) on delete cascade,
  notes text,
  saved_at timestamptz not null default timezone('utc', now()),
  constraint uq_saved_courses_user_request unique (user_id, request_id)
);

create table if not exists public.public_data_sync_runs (
  id bigserial primary key,
  source varchar(100) not null,
  status varchar(20) not null
    check (status in ('started', 'completed', 'failed')),
  imported_count integer not null default 0,
  updated_count integer not null default 0,
  error_message text,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz
);

create index if not exists idx_profiles_preferred_region
  on public.profiles(preferred_region);

create index if not exists idx_profiles_preferred_category
  on public.profiles(preferred_category);

create index if not exists idx_public_data_region
  on public.public_data(region);

create index if not exists idx_public_data_category
  on public.public_data(category);

create index if not exists idx_public_data_title_trgm
  on public.public_data using gin (to_tsvector('simple', coalesce(title, '')));

create index if not exists idx_recommendation_requests_user_created_at
  on public.recommendation_requests(user_id, created_at desc);

create index if not exists idx_recommendations_user_request
  on public.recommendations(user_id, request_id);

create index if not exists idx_recommendations_public_data
  on public.recommendations(public_data_id);

create index if not exists idx_saved_courses_user_saved_at
  on public.saved_courses(user_id, saved_at desc);

create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_current_timestamp_updated_at();

create trigger set_public_data_updated_at
before update on public.public_data
for each row
execute function public.set_current_timestamp_updated_at();

create trigger set_recommendation_requests_updated_at
before update on public.recommendation_requests
for each row
execute function public.set_current_timestamp_updated_at();

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    nickname
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nickname', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_auth_user_created();

alter table public.profiles enable row level security;
alter table public.public_data enable row level security;
alter table public.recommendation_requests enable row level security;
alter table public.recommendations enable row level security;
alter table public.saved_courses enable row level security;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "public_data_read_authenticated"
on public.public_data
for select
to authenticated
using (true);

create policy "recommendation_requests_select_own"
on public.recommendation_requests
for select
to authenticated
using (auth.uid() = user_id);

create policy "recommendation_requests_insert_own"
on public.recommendation_requests
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "recommendation_requests_update_own"
on public.recommendation_requests
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "recommendations_select_own"
on public.recommendations
for select
to authenticated
using (auth.uid() = user_id);

create policy "recommendations_insert_own"
on public.recommendations
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "saved_courses_select_own"
on public.saved_courses
for select
to authenticated
using (auth.uid() = user_id);

create policy "saved_courses_insert_own"
on public.saved_courses
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "saved_courses_update_own"
on public.saved_courses
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "saved_courses_delete_own"
on public.saved_courses
for delete
to authenticated
using (auth.uid() = user_id);
