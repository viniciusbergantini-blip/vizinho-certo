alter table public.push_tokens add column if not exists installation_id uuid;
create unique index if not exists push_tokens_installation_uidx on public.push_tokens(usuario_id,installation_id);

create table public.push_installation_settings (
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  installation_id uuid not null,
  enabled boolean not null default false,
  automaticas boolean not null default false,
  plataforma text not null check (plataforma in ('web','android')),
  atualizado_em timestamptz not null default now(),
  primary key(usuario_id,installation_id)
);
alter table public.push_installation_settings enable row level security;
revoke all on public.push_installation_settings from public,anon,authenticated;
grant select,insert,update,delete on public.push_installation_settings to service_role;

-- One row lock serializes rotation, explicit disabling and daily-summary preference.
-- SECURITY INVOKER: only the authenticated API's service role can execute this transaction.
create function public.configure_push_installation(
  p_usuario_id uuid,p_installation_id uuid,p_token text,p_plataforma text,p_action text,p_automaticas boolean default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pref public.push_installation_settings%rowtype;
begin
  if p_action not in ('register','recover','disable','preferences') or p_plataforma not in ('web','android') then
    raise exception 'Invalid push configuration' using errcode='22023';
  end if;
  insert into public.push_installation_settings(usuario_id,installation_id,plataforma,automaticas)
    values(p_usuario_id,p_installation_id,p_plataforma,
      coalesce((select t.automaticas from public.push_tokens t where t.usuario_id=p_usuario_id and t.token=p_token limit 1),false))
    on conflict(usuario_id,installation_id) do nothing;
  select * into pref from public.push_installation_settings
    where usuario_id=p_usuario_id and installation_id=p_installation_id for update;
  if p_action='disable' then
    update public.push_installation_settings set enabled=false,automaticas=false,atualizado_em=now()
      where usuario_id=p_usuario_id and installation_id=p_installation_id;
    delete from public.push_tokens where usuario_id=p_usuario_id
      and (installation_id=p_installation_id or token=p_token);
    return jsonb_build_object('enabled',false,'registered',false,'automaticas',false);
  end if;
  if p_action='preferences' then
    if not pref.enabled or p_automaticas is null or pref.plataforma<>'android' then
      raise exception 'Ative as notificações no Android primeiro.' using errcode='22023';
    end if;
    update public.push_installation_settings set automaticas=p_automaticas,atualizado_em=now()
      where usuario_id=p_usuario_id and installation_id=p_installation_id;
    update public.push_tokens set automaticas=p_automaticas
      where usuario_id=p_usuario_id and installation_id=p_installation_id;
    return jsonb_build_object('enabled',true,'registered',true,'automaticas',p_automaticas);
  end if;
  if p_action='recover' and not pref.enabled then
    return jsonb_build_object('enabled',false,'registered',false,'automaticas',pref.automaticas);
  end if;
  if p_token is null then raise exception 'Subscription required' using errcode='22023'; end if;
  -- The caller possesses the subscription; remove obsolete ownership/legacy serialization for it.
  delete from public.push_tokens where token=p_token
    and (usuario_id<>p_usuario_id or installation_id is distinct from p_installation_id);
  insert into public.push_tokens(usuario_id,installation_id,token,plataforma,automaticas)
    values(p_usuario_id,p_installation_id,p_token,p_plataforma,pref.automaticas)
    on conflict(usuario_id,installation_id) do update set token=excluded.token,
      plataforma=excluded.plataforma,automaticas=excluded.automaticas;
  update public.push_installation_settings set enabled=true,plataforma=p_plataforma,atualizado_em=now()
    where usuario_id=p_usuario_id and installation_id=p_installation_id;
  return jsonb_build_object('enabled',true,'registered',true,'automaticas',pref.automaticas);
end $$;
revoke all on function public.configure_push_installation(uuid,uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.configure_push_installation(uuid,uuid,text,text,text,boolean) to service_role;
