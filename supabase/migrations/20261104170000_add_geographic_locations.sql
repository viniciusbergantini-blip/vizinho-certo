create extension if not exists postgis with schema extensions;

alter table public.usuarios
  add column if not exists localizacao extensions.geography(point, 4326),
  add column if not exists localizacao_fonte text not null default 'legacy',
  add column if not exists localizacao_precisao text not null default 'unknown',
  add column if not exists localizacao_acuracia_m double precision,
  add column if not exists localizacao_verificada_em timestamptz;

alter table public.usuarios
  drop constraint if exists usuarios_localizacao_fonte_check,
  add constraint usuarios_localizacao_fonte_check
    check (localizacao_fonte in ('legacy', 'address', 'gps', 'map')),
  drop constraint if exists usuarios_localizacao_precisao_check,
  add constraint usuarios_localizacao_precisao_check
    check (localizacao_precisao in ('unknown', 'rooftop', 'number', 'street', 'neighborhood', 'postal_code', 'city', 'gps')),
  drop constraint if exists usuarios_localizacao_acuracia_check,
  add constraint usuarios_localizacao_acuracia_check
    check (localizacao_acuracia_m is null or localizacao_acuracia_m >= 0);

create or replace function public.sincronizar_localizacao_usuario()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.lat between -90 and 90 and new.lon between -180 and 180 then
    new.localizacao := extensions.st_setsrid(extensions.st_makepoint(new.lon, new.lat), 4326)::extensions.geography;
  else
    new.localizacao := null;
  end if;
  return new;
end;
$$;

drop trigger if exists usuarios_sincronizar_localizacao on public.usuarios;
create trigger usuarios_sincronizar_localizacao
before insert or update of lat, lon on public.usuarios
for each row execute function public.sincronizar_localizacao_usuario();

update public.usuarios
set localizacao = extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography
where lat between -90 and 90
  and lon between -180 and 180
  and localizacao is null;

create index if not exists usuarios_localizacao_gist
  on public.usuarios using gist (localizacao);

create or replace function public.vizinhos_no_raio_v2(
  p_usuario_id uuid,
  p_lat double precision,
  p_lon double precision,
  p_raio_m integer,
  p_limite integer default 100
)
returns table (
  id uuid,
  apelido text,
  nome text,
  bairro text,
  cidade text,
  foto_url text,
  distancia_metros double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with origem as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326)::extensions.geography as ponto
  )
  select
    u.id,
    u.apelido,
    u.nome,
    u.bairro,
    u.cidade,
    u.foto_url,
    extensions.st_distance(u.localizacao, origem.ponto) as distancia_metros
  from public.usuarios u
  cross join origem
  where u.id <> p_usuario_id
    and u.localizacao is not null
    and extensions.st_dwithin(u.localizacao, origem.ponto, greatest(50, least(p_raio_m, 500)))
  order by u.localizacao operator(extensions.<->) origem.ponto
  limit greatest(1, least(p_limite, 100));
$$;

revoke all on function public.vizinhos_no_raio_v2(uuid, double precision, double precision, integer, integer) from public, anon, authenticated;
grant execute on function public.vizinhos_no_raio_v2(uuid, double precision, double precision, integer, integer) to service_role;

comment on column public.usuarios.localizacao is 'Ponto privado usado apenas para calculos de proximidade; nunca deve ser exposto em respostas publicas.';
comment on function public.vizinhos_no_raio_v2 is 'Busca privada e indexada de vizinhos por distancia geografica real.';
