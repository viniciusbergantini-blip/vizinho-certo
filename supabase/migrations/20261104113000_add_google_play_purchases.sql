alter table public.anuncios
  add column if not exists payment_provider text not null default 'stripe'
    check (payment_provider in ('stripe', 'google_play')),
  add column if not exists google_play_purchase_hash text;

create unique index if not exists anuncios_google_play_purchase_hash_unique
  on public.anuncios (google_play_purchase_hash)
  where google_play_purchase_hash is not null;

create table if not exists public.google_play_purchases (
  purchase_token_hash text primary key check (purchase_token_hash ~ '^[a-f0-9]{64}$'),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null check (product_id in (
    'anuncio_rua_10d',
    'anuncio_bairro_20d',
    'anuncio_regiao_30d',
    'anuncio_cidade_30d'
  )),
  plano_id text not null check (plano_id in ('rua', 'bairro', 'regiao', 'cidade')),
  package_name text not null default 'br.com.vizinhocerto.app',
  order_id text,
  status text not null default 'verificada'
    check (status in ('verificada', 'publicada', 'consumida', 'falhou')),
  anuncio_id uuid unique references public.anuncios(id) on delete set null,
  compra_teste boolean not null default false,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now()
);

create index if not exists google_play_purchases_usuario_criado_idx
  on public.google_play_purchases (usuario_id, criado_em desc);

alter table public.google_play_purchases enable row level security;
revoke all on table public.google_play_purchases from anon, authenticated;
grant select, insert, update on table public.google_play_purchases to service_role;

comment on table public.google_play_purchases is
  'Compras verificadas no servidor pela Google Play. Sem acesso direto de clientes.';
comment on column public.google_play_purchases.purchase_token_hash is
  'Hash SHA-256 para idempotencia; o token secreto da compra nunca e armazenado.';
