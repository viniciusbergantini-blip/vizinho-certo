create table if not exists public.bloqueios_usuarios (
  bloqueador_id uuid not null references public.usuarios(id) on delete cascade,
  bloqueado_id uuid not null references public.usuarios(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (bloqueador_id, bloqueado_id),
  constraint bloqueios_usuarios_nao_auto check (bloqueador_id <> bloqueado_id)
);

create table if not exists public.denuncias_conteudo (
  id uuid primary key default gen_random_uuid(),
  denunciante_id uuid not null references public.usuarios(id) on delete cascade,
  denunciado_id uuid references public.usuarios(id) on delete set null,
  tipo_conteudo text not null check (tipo_conteudo in ('post', 'comentario', 'perfil', 'anuncio')),
  conteudo_id text not null,
  motivo text not null check (char_length(motivo) between 3 and 500),
  status text not null default 'pendente' check (status in ('pendente', 'analisada', 'removida', 'descartada')),
  criado_em timestamptz not null default now(),
  analisado_em timestamptz,
  constraint denuncias_conteudo_unica unique (denunciante_id, tipo_conteudo, conteudo_id)
);

create index if not exists bloqueios_usuarios_bloqueado_idx
  on public.bloqueios_usuarios (bloqueado_id, bloqueador_id);
create index if not exists denuncias_conteudo_status_idx
  on public.denuncias_conteudo (status, criado_em desc);

alter table public.bloqueios_usuarios enable row level security;
alter table public.denuncias_conteudo enable row level security;

revoke all on table public.bloqueios_usuarios from anon, authenticated;
revoke all on table public.denuncias_conteudo from anon, authenticated;

comment on table public.bloqueios_usuarios is
  'Bloqueios entre moradores. A API server-side aplica o bloqueio nos dois sentidos ao listar conteudo.';
comment on table public.denuncias_conteudo is
  'Fila privada de moderacao para denuncias de posts, comentarios, perfis e anuncios.';
