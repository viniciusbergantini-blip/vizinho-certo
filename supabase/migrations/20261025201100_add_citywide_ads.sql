begin;

alter table public.anuncios
  add column if not exists plano_id text,
  add column if not exists alcance_tipo text not null default 'raio',
  add column if not exists cidade_alvo text,
  add column if not exists uf_alvo text;

update public.anuncios
set plano_id = case dias
  when 10 then 'rua'
  when 20 then 'bairro'
  when 30 then 'regiao'
  else null
end
where plano_id is null;

alter table public.anuncios drop constraint if exists anuncios_plano_id_valido;
alter table public.anuncios add constraint anuncios_plano_id_valido
  check (plano_id is null or plano_id in ('rua', 'bairro', 'regiao', 'cidade'));

alter table public.anuncios drop constraint if exists anuncios_alcance_tipo_valido;
alter table public.anuncios add constraint anuncios_alcance_tipo_valido
  check (alcance_tipo in ('raio', 'cidade'));

alter table public.anuncios drop constraint if exists anuncios_cidade_alvo_consistente;
alter table public.anuncios add constraint anuncios_cidade_alvo_consistente
  check (
    alcance_tipo = 'raio'
    or (
      nullif(btrim(cidade_alvo), '') is not null
      and uf_alvo ~ '^[A-Z]{2}$'
    )
  );

create index if not exists anuncios_cidade_ativa_idx
  on public.anuncios (cidade_alvo, uf_alvo, expira_em desc)
  where ativo = true and alcance_tipo = 'cidade';

create index if not exists analytics_events_anuncio_idx
  on public.analytics_events ((metadata->>'ad_id'), created_at desc)
  where metadata->>'source' = 'ads';

comment on column public.anuncios.alcance_tipo is
  'Define se o anúncio usa raio em quilômetros ou a cidade e UF contratadas.';
comment on column public.anuncios.plano_id is
  'Identificador estável do plano contratado; anúncios antigos podem permanecer sem valor.';
comment on column public.anuncios.cidade_alvo is
  'Cidade congelada no momento da compra para anúncios municipais.';
comment on column public.anuncios.uf_alvo is
  'UF congelada no momento da compra para anúncios municipais.';

notify pgrst, 'reload schema';

commit;
