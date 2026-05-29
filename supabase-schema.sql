create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  avatar_url text,
  display_name text,
  points integer not null default 0,
  paid boolean not null default false,
  free_used_date date,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists point_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  type text not null,
  points integer not null,
  job_id uuid,
  stripe_session_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists generation_jobs (
  id uuid primary key default gen_random_uuid(),
  provider_task_id text,
  user_id uuid not null references profiles(id),
  status text not null,
  progress integer not null default 0,
  product_name text not null,
  design_type_id text not null,
  design_type_label text not null,
  prompt text not null,
  target_language text not null,
  resolution text not null,
  cost integer not null default 0,
  billing_type text not null,
  watermark boolean not null default false,
  refunded boolean not null default false,
  source_images jsonb not null default '[]',
  output_image_url text,
  failure_reason text,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists design_types (
  id text primary key,
  label text not null,
  sort_order integer not null,
  preset_prompt text not null,
  image_preset text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists featured_showcase (
  id uuid primary key default gen_random_uuid(),
  generation_job_id uuid references generation_jobs(id),
  title text not null,
  type_label text not null,
  image_url text not null,
  prompt text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  feature text not null default 'style_series',
  source_job_id uuid,
  created_at timestamptz not null default now()
);

insert into profiles (email, display_name, points, paid)
values ('hi@lazy60.com', 'LAZY60 Demo', 0, false)
on conflict (email) do nothing;
