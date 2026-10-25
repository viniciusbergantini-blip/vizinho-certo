-- Vizinho Certo - etapa 1 do endurecimento de segurança.
-- Esta preparação é compatível com a versão pública atual do app.
-- Ela não remove colunas nem revoga os acessos usados pelo frontend legado.

begin;

-- Novos objetos começam fechados por padrão; liberações futuras devem ser explícitas.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- Apoios passam a ter identidade única; um usuário não consegue inflar a contagem.
create table if not exists public.post_apoios (
  post_id uuid not null references public.posts(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (post_id, usuario_id)
);
alter table public.post_apoios enable row level security;
revoke all on table public.post_apoios from anon, authenticated;
grant select, insert, update, delete on table public.post_apoios to service_role;

-- Evita publicação duplicada do mesmo pagamento.
-- A base foi verificada antes desta migração: não há sessões Stripe duplicadas.
create unique index if not exists anuncios_stripe_session_id_unique
on public.anuncios (stripe_session_id)
where stripe_session_id is not null;

-- Valida somente gravações novas; os dados históricos podem ser saneados depois.
alter table public.usuarios drop constraint if exists usuarios_lat_range;
alter table public.usuarios add constraint usuarios_lat_range
  check (lat is null or lat between -90 and 90) not valid;
alter table public.usuarios drop constraint if exists usuarios_lon_range;
alter table public.usuarios add constraint usuarios_lon_range
  check (lon is null or lon between -180 and 180) not valid;
alter table public.posts drop constraint if exists posts_tipo_valido;
alter table public.posts add constraint posts_tipo_valido
  check (tipo in ('problema', 'aviso', 'ajuda', 'info')) not valid;
alter table public.posts drop constraint if exists posts_texto_tamanho;
alter table public.posts add constraint posts_texto_tamanho
  check (char_length(texto) <= 1000) not valid;
alter table public.comentarios drop constraint if exists comentarios_texto_tamanho;
alter table public.comentarios add constraint comentarios_texto_tamanho
  check (char_length(texto) between 1 and 300) not valid;

-- Mantém o bucket compatível com os uploads atuais, limitando tamanho e formato.
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'fotos';

commit;

notify pgrst, 'reload schema';
