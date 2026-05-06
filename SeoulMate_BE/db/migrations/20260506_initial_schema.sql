create extension if not exists pgcrypto;

create or replace function set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = current_timestamp;
  return new;
end;
$$;

create table if not exists users (
  id bigserial primary key,
  email varchar(255) not null unique,
  password_hash varchar(255) not null,
  nickname varchar(50) not null unique,
  preferred_region varchar(50),
  preferred_category varchar(100),
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp
);

create table if not exists public_data (
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
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp,
  constraint uq_public_data_source_record unique (source, source_record_id)
);

create table if not exists recommendation_requests (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  request_text text,
  preferred_region varchar(50),
  preferred_category varchar(100),
  budget integer check (budget is null or budget >= 0),
  companion varchar(50),
  transport_mode varchar(30),
  status varchar(20) not null default 'pending'
    check (status in ('pending', 'completed', 'failed')),
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp
);

create table if not exists recommendations (
  id bigserial primary key,
  request_id bigint not null references recommendation_requests(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  public_data_id bigint not null references public_data(id) on delete cascade,
  course_order integer check (course_order is null or course_order > 0),
  score numeric(5, 2) not null check (score >= 0 and score <= 100),
  reason text,
  travel_minutes integer check (travel_minutes is null or travel_minutes >= 0),
  estimated_cost integer check (estimated_cost is null or estimated_cost >= 0),
  created_at timestamp not null default current_timestamp,
  constraint uq_recommendations_request_place unique (request_id, public_data_id)
);

create table if not exists saved_courses (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  request_id bigint not null references recommendation_requests(id) on delete cascade,
  notes text,
  saved_at timestamp not null default current_timestamp,
  constraint uq_saved_courses_user_request unique (user_id, request_id)
);

create table if not exists public_data_sync_runs (
  id bigserial primary key,
  source varchar(100) not null,
  status varchar(20) not null
    check (status in ('started', 'completed', 'failed')),
  imported_count integer not null default 0,
  updated_count integer not null default 0,
  error_message text,
  started_at timestamp not null default current_timestamp,
  finished_at timestamp
);

create index if not exists idx_users_email on users(email);
create index if not exists idx_users_preferred_region on users(preferred_region);
create index if not exists idx_users_preferred_category on users(preferred_category);
create index if not exists idx_public_data_region on public_data(region);
create index if not exists idx_public_data_category on public_data(category);
create index if not exists idx_public_data_title_tsv
  on public_data using gin (to_tsvector('simple', coalesce(title, '')));
create index if not exists idx_recommendation_requests_user_created_at
  on recommendation_requests(user_id, created_at desc);
create index if not exists idx_recommendations_user_request
  on recommendations(user_id, request_id);
create index if not exists idx_recommendations_public_data
  on recommendations(public_data_id);
create index if not exists idx_saved_courses_user_saved_at
  on saved_courses(user_id, saved_at desc);

create trigger set_users_updated_at
before update on users
for each row
execute function set_current_timestamp_updated_at();

create trigger set_public_data_updated_at
before update on public_data
for each row
execute function set_current_timestamp_updated_at();

create trigger set_recommendation_requests_updated_at
before update on recommendation_requests
for each row
execute function set_current_timestamp_updated_at();
