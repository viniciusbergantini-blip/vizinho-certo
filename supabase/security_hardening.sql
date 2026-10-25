-- Vizinho Certo - etapa 2 do endurecimento de acesso e privacidade.
-- Aplicar imediatamente depois de publicar o frontend/API que acompanha esta alteração.
-- Não executar isoladamente: a versão pública antiga ainda depende de acessos diretos.

begin;

-- A senha pertence exclusivamente ao Supabase Auth. Este campo legado não é usado pelo app.
alter table public.usuarios drop column if exists senha_hash;

alter table public.usuarios enable row level security;
alter table public.posts enable row level security;
alter table public.comentarios enable row level security;
alter table public.push_tokens enable row level security;
alter table public.anuncios enable row level security;
alter table public.analytics_events enable row level security;

-- Remove políticas antigas para não deixar permissões amplas sobreviverem à migração.
do $$
declare policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname in ('public', 'storage')
      and tablename in ('usuarios', 'posts', 'comentarios', 'push_tokens', 'anuncios', 'analytics_events', 'objects')
  loop
    execute format('drop policy if exists %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end $$;

revoke all on table public.usuarios from anon, authenticated;
revoke all on table public.posts from anon, authenticated;
revoke all on table public.comentarios from anon, authenticated;
revoke all on table public.push_tokens from anon, authenticated;
revoke all on table public.anuncios from anon, authenticated;
revoke all on table public.analytics_events from anon, authenticated;

-- Novas tabelas e funções começam fechadas; o acesso precisa ser concedido de forma explícita.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- O navegador acessa somente o próprio perfil. Feed, vizinhos, anúncios e métricas passam pelo backend.
grant select, insert, update on table public.usuarios to authenticated;

create policy usuarios_select_own
on public.usuarios for select
to authenticated
using ((select auth.uid()) = id);

create policy usuarios_insert_own
on public.usuarios for insert
to authenticated
with check ((select auth.uid()) = id);

create policy usuarios_update_own
on public.usuarios for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Cada usuário pode registrar e remover somente sua própria inscrição de push.
grant select, insert, update, delete on table public.push_tokens to authenticated;

create policy push_tokens_select_own
on public.push_tokens for select
to authenticated
using ((select auth.uid()) = usuario_id);

create policy push_tokens_insert_own
on public.push_tokens for insert
to authenticated
with check ((select auth.uid()) = usuario_id);

create policy push_tokens_update_own
on public.push_tokens for update
to authenticated
using ((select auth.uid()) = usuario_id)
with check ((select auth.uid()) = usuario_id);

create policy push_tokens_delete_own
on public.push_tokens for delete
to authenticated
using ((select auth.uid()) = usuario_id);

-- Apoios passam a ter identidade única; um usuário não consegue inflar a contagem repetindo chamadas.
create table if not exists public.post_apoios (
  post_id uuid not null references public.posts(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (post_id, usuario_id)
);
alter table public.post_apoios enable row level security;
revoke all on table public.post_apoios from anon, authenticated;
grant select, insert, update, delete on table public.post_apoios to service_role;

-- Evita dupla publicação do mesmo pagamento, inclusive sob concorrência de webhook e retorno do checkout.
create unique index if not exists anuncios_stripe_session_id_unique
on public.anuncios (stripe_session_id)
where stripe_session_id is not null;

-- Valida novos dados sem bloquear a migração por registros históricos.
alter table public.usuarios drop constraint if exists usuarios_lat_range;
alter table public.usuarios add constraint usuarios_lat_range check (lat is null or lat between -90 and 90) not valid;
alter table public.usuarios drop constraint if exists usuarios_lon_range;
alter table public.usuarios add constraint usuarios_lon_range check (lon is null or lon between -180 and 180) not valid;
alter table public.posts drop constraint if exists posts_tipo_valido;
alter table public.posts add constraint posts_tipo_valido check (tipo in ('problema', 'aviso', 'ajuda', 'info')) not valid;
alter table public.posts drop constraint if exists posts_texto_tamanho;
alter table public.posts add constraint posts_texto_tamanho check (char_length(texto) <= 1000) not valid;
alter table public.comentarios drop constraint if exists comentarios_texto_tamanho;
alter table public.comentarios add constraint comentarios_texto_tamanho check (char_length(texto) between 1 and 300) not valid;

-- As antigas funções expunham localizações quando chamadas com a chave anônima.
do $$
declare function_row record;
begin
  for function_row in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('posts_no_raio', 'vizinhos_no_raio')
  loop
    execute format('revoke all on function %I.%I(%s) from public, anon, authenticated', function_row.nspname, function_row.proname, function_row.args);
  end loop;
end $$;

-- Uploads limitados a imagens, 5 MB e a uma pasta pertencente ao usuário autenticado.
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'fotos';

grant select, insert, update, delete on table storage.objects to authenticated;

create policy fotos_select_own
on storage.objects for select
to authenticated
using (
  bucket_id = 'fotos'
  and (storage.foldername(name))[1] in ('posts', 'perfis')
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

create policy fotos_insert_own
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'fotos'
  and (storage.foldername(name))[1] in ('posts', 'perfis')
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
);

create policy fotos_update_own
on storage.objects for update
to authenticated
using (
  bucket_id = 'fotos'
  and owner_id = (select auth.uid())::text
)
with check (
  bucket_id = 'fotos'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] in ('posts', 'perfis')
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
);

create policy fotos_delete_own
on storage.objects for delete
to authenticated
using (bucket_id = 'fotos' and owner_id = (select auth.uid())::text);

commit;

notify pgrst, 'reload schema';
