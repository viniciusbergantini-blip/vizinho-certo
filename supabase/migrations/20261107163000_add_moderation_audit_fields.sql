alter table public.denuncias_conteudo
  add column if not exists decisao text,
  add column if not exists observacao_admin text,
  add column if not exists moderador_email text;

alter table public.denuncias_conteudo drop constraint if exists denuncias_conteudo_decisao_check;
alter table public.denuncias_conteudo add constraint denuncias_conteudo_decisao_check
  check (decisao is null or decisao in ('sem_violacao', 'conteudo_removido', 'perfil_revisado'));

alter table public.denuncias_conteudo drop constraint if exists denuncias_conteudo_observacao_tamanho_check;
alter table public.denuncias_conteudo add constraint denuncias_conteudo_observacao_tamanho_check
  check (observacao_admin is null or char_length(observacao_admin) <= 1000);

comment on column public.denuncias_conteudo.decisao is 'Resultado administrativo da análise da denúncia.';
comment on column public.denuncias_conteudo.observacao_admin is 'Nota privada e opcional do administrador responsável pela decisão.';
comment on column public.denuncias_conteudo.moderador_email is 'Identificador privado do administrador que concluiu a análise.';
