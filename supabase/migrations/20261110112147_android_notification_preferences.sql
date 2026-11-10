alter table public.push_tokens
  add column if not exists plataforma text not null default 'web' check (plataforma in ('web','android')),
  add column if not exists automaticas boolean not null default false;

create index if not exists push_tokens_android_digest_idx on public.push_tokens (usuario_id)
  where plataforma = 'android' and automaticas;

create table if not exists public.push_digest_deliveries (
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  dia date not null,
  status text not null check (status in ('claimed','sent','failed')),
  aparelhos integer not null default 0 check (aparelhos >= 0),
  criado_em timestamptz not null default now(),
  primary key (usuario_id,dia)
);
alter table public.push_digest_deliveries enable row level security;
revoke all on public.push_digest_deliveries from anon, authenticated;
grant select,insert,update,delete on public.push_digest_deliveries to service_role;
