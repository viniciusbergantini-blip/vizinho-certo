create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('landing_view', 'cta_click', 'signup_started', 'signup_completed')),
  session_id text not null,
  city text check (city in ('indaiatuba', 'maringa', 'londrina')),
  path text,
  user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_created_at_idx on public.analytics_events (created_at desc);
create index if not exists analytics_events_city_type_created_idx on public.analytics_events (city, event_type, created_at desc);
create index if not exists analytics_events_session_idx on public.analytics_events (session_id);
create index if not exists analytics_events_user_id_idx on public.analytics_events (user_id);

alter table public.analytics_events enable row level security;
