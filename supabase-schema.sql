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
  api_prompt text,
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

create unique index if not exists waitlist_email_feature_key
on waitlist (lower(email), feature);

create table if not exists portfolio_profile (
  id text primary key default 'main',
  name text not null,
  bio text not null default '',
  avatar_url text,
  whatsapp_url text,
  messenger_url text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portfolio_cases (
  id text primary key,
  title text not null,
  description text not null default '',
  before_image_url text,
  after_image_url text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into profiles (email, display_name, points, paid)
values ('hi@lazy60.com', 'LAZY60 Demo', 0, false)
on conflict (email) do nothing;

insert into portfolio_profile (id, name, bio, avatar_url, whatsapp_url, messenger_url, email)
values (
  'main',
  'Cayman',
  'AI did not nail it? Let the founder design for you directly. Custom premium boutique layouts.',
  'https://i.imgur.com/Qjg7Ikk.png',
  'https://wa.me/8613825136068',
  'https://www.messenger.com/t/hiro.yuki.7106',
  'hi@lazy60.com'
)
on conflict (id) do nothing;

insert into portfolio_cases (id, title, description, before_image_url, after_image_url, sort_order)
values
  (
    'case_coffee',
    'Premium Ceramic Cup',
    'Hard studio lighting with crisp shadows.',
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1200&q=80',
    1
  ),
  (
    'case_sofa',
    'Nordic Studio Sofa',
    'Clean perspective layout',
    'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1540574163026-643ea20ade25?auto=format&fit=crop&w=1200&q=80',
    2
  )
on conflict (id) do nothing;
