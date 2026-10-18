create table if not exists public.eventos (
  id uuid primary key default gen_random_uuid(),
  criado_por uuid references auth.users(id) on delete set null,
  titulo text not null check (char_length(titulo) between 3 and 120),
  descricao text not null default '' check (char_length(descricao) <= 1000),
  categoria text not null check (categoria in ('Feira', 'Show', 'Cultura', 'Esporte', 'Infantil', 'Gastronomia', 'Curso', 'Comunidade', 'Outros')),
  inicio_em timestamptz not null,
  fim_em timestamptz,
  local_nome text not null check (char_length(local_nome) between 2 and 120),
  bairro text,
  cidade text not null,
  uf text not null check (char_length(uf) between 2 and 3),
  endereco text,
  gratuito boolean not null default true,
  preco_texto text,
  fonte_tipo text not null default 'comunidade' check (fonte_tipo in ('comunidade', 'oficial', 'parceiro', 'importado')),
  fonte_nome text,
  fonte_url text,
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'rejeitado', 'cancelado')),
  verificado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint eventos_periodo_valido check (fim_em is null or fim_em >= inicio_em),
  constraint eventos_preco_valido check (gratuito or nullif(trim(preco_texto), '') is not null)
);

create index if not exists eventos_cidade_status_inicio_idx
  on public.eventos (cidade, uf, status, inicio_em);
create index if not exists eventos_criado_por_criado_em_idx
  on public.eventos (criado_por, criado_em desc);

alter table public.eventos enable row level security;

revoke all on table public.eventos from anon, authenticated;
grant select, insert, update, delete on table public.eventos to service_role;

comment on table public.eventos is
  'Agenda local moderada. O app acessa esta tabela apenas por APIs autenticadas com service role.';
comment on column public.eventos.fonte_tipo is
  'Origem do dado; importado prepara integrações futuras, mas não implica validação automática.';

notify pgrst, 'reload schema';
