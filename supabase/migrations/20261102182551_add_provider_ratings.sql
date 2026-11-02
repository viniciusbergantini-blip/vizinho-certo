begin;

create table if not exists public.avaliacoes_prestadores (
  id uuid primary key default gen_random_uuid(),
  prestador_id uuid not null references auth.users(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  estrelas smallint not null check (estrelas between 1 and 5),
  criado_em timestamptz not null default now(),
  constraint avaliacoes_prestadores_sem_autoavaliacao check (prestador_id <> usuario_id),
  constraint avaliacoes_prestadores_um_por_morador unique (prestador_id, usuario_id)
);

alter table public.avaliacoes_prestadores enable row level security;
revoke all on table public.avaliacoes_prestadores from anon, authenticated;
grant select, insert, update, delete on table public.avaliacoes_prestadores to service_role;

create index if not exists avaliacoes_prestadores_prestador_idx
  on public.avaliacoes_prestadores (prestador_id, criado_em desc);

create or replace view public.avaliacoes_prestadores_resumo
with (security_invoker = true)
as
select
  prestador_id,
  round(avg(estrelas)::numeric, 1) as media,
  count(*)::integer as quantidade
from public.avaliacoes_prestadores
group by prestador_id;

revoke all on public.avaliacoes_prestadores_resumo from public, anon, authenticated;
grant select on public.avaliacoes_prestadores_resumo to service_role;

comment on table public.avaliacoes_prestadores is
  'Notas de 1 a 5 dadas por moradores a prestadores anunciados; o app não afirma que o serviço foi contratado ou verificado.';

commit;
