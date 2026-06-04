# LAZY60

Minimal ecommerce design generator prototype.

## Run Locally

```powershell
npm.cmd run dev
```

Open:

```text
http://127.0.0.1:4173
```

For deployment platforms such as Render, use:

```text
Build Command: npm install
Start Command: npm start
```

If `KIE_API_KEY` is not set, the app uses demo fallback mode while keeping the same request, job, polling, billing, and refund flow.

## Environment

Create `.env` from `.env.example`.

```env
KIE_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
KEEPALIVE_SECRET=
ADMIN_EMAILS=hi@lazy60.com
```

## Keepalive

The app includes a protected keepalive endpoint for lightweight health checks:

```text
GET /api/keepalive?key=YOUR_KEEPALIVE_SECRET
```

It pings the app and performs a tiny Supabase query. Set the same `KEEPALIVE_SECRET` in Render and GitHub Actions secrets, then the workflow in `.github/workflows/keepalive.yml` will run once per day.

## Demo Test Hooks

To force a failed generation and test refund UI, include either word in the design prompt:

```text
force_fail
test_refund
```

## Billing Rules

- Currency: Points
- `$1 = 10 Points`
- 1K: 2 points
- 2K: 3 points
- 4K: 5 points
- Logged-in unpaid users get 1 free 1K generation every day
- Daily free output has watermark flag
- Any points-paid generation has no watermark

## Planned Supabase Tables

### profiles

Stores user account and billing state.

```sql
create table profiles (
  id uuid primary key,
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
```

### point_ledger

Append-only accounting log.

```sql
create table point_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  type text not null,
  points integer not null,
  job_id uuid,
  stripe_session_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
```

### generation_jobs

Async image generation state.

```sql
create table generation_jobs (
  id uuid primary key default gen_random_uuid(),
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
```

### design_types

Admin-editable prompt presets.

```sql
create table design_types (
  id text primary key,
  label text not null,
  sort_order integer not null,
  preset_prompt text not null,
  image_preset text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### featured_showcase

Manual cold-start examples and curated generation results.

```sql
create table featured_showcase (
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
```

### waitlist

Collects interest for style-consistent series generation.

```sql
create table waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  feature text not null default 'style_series',
  source_job_id uuid,
  created_at timestamptz not null default now()
);
```

## Next Implementation Steps

1. Store uploads and generated images in Supabase Storage.
2. Add Stripe webhook-driven point top-ups for production.
3. Restrict `/admin` data edits to `ADMIN_EMAILS`.

## KIE Image Provider

The image generation provider is KIE:

- Create task: `POST https://api.kie.ai/api/v1/jobs/createTask`
- Query task: `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=...`
- Model: `gpt-image-2-image-to-image`
- Uploaded product images are first sent to the KIE base64 file upload endpoint so generation can use public `input_urls`.

Set:

```env
KIE_API_KEY=your_key_here
```

## Stripe Checkout

Local development supports Stripe Checkout when these keys are set:

```env
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

Current local behavior:

- Top-up creates a Stripe Checkout Session.
- Success returns to `http://127.0.0.1:4173?checkout=success&pack=...`.
- The app temporarily adds points on success return for local testing.

Production behavior still needs webhook verification:

- Event: `checkout.session.completed`
- Webhook secret: `STRIPE_WEBHOOK_SECRET=whsec_...`
- Points should be added only from the verified webhook, not from the success URL.

Current webhook endpoint:

```text
/api/stripe/webhook
```

For Render, the full endpoint will look like:

```text
https://your-render-service.onrender.com/api/stripe/webhook
```

After connecting `lazy60.com`, use:

```text
https://lazy60.com/api/stripe/webhook
```

## Render Deployment

1. Push this folder to a GitHub repository.
2. In Render, create a new **Web Service**.
3. Connect the GitHub repository.
4. Use:

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
```

5. Add environment variables:

```env
HOST=0.0.0.0
KIE_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
KEEPALIVE_SECRET=
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
ADMIN_EMAILS=
```

6. Deploy.
7. Add the Render URL to:

- Supabase Auth Site URL / Redirect URLs
- Google OAuth Authorized JavaScript origins
- Stripe Checkout and webhook settings

8. After custom domain setup, replace the Render URL with `https://lazy60.com`.

## Squarespace Domain

When Render gives you DNS records for the custom domain, add them in Squarespace domain DNS settings.

Typical setup:

- `www.lazy60.com`: CNAME to Render target
- `lazy60.com`: Render may provide an A record or ALIAS/ANAME-style instruction depending on its current custom domain flow

Follow the exact DNS records Render shows for your service.
