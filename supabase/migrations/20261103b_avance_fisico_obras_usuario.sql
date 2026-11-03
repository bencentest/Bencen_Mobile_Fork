-- Fase 2-C bis (2026-11-03): reemplaza toggle_permission para Avance físico.
-- Portal/SQL_SEGURIDAD_URGENTE_2026_10_29.sql le quitó la ejecución a toggle_permission porque no
-- controlaba quién la llamaba; esta app sí la usaba para asignar obras y quedó con
-- "permission denied for function toggle_permission". toggle_permission no se toca.
--
-- avance_fisico_set_obra: asigna o quita una obra a una persona, sólo admin/admin_gerencia de Mobile
-- (avance_fisico_es_admin, creada en 20261103_avance_fisico_funciones_usuarios.sql).
-- avance_fisico_set_rol: igual que antes, y al quitar el rol también borra sus obras asignadas.
-- No cambia datos al correrlo. Transaccional.

begin;

create or replace function public.avance_fisico_set_obra(p_usuario_id uuid, p_licitacion_id bigint, p_habilitado boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.avance_fisico_es_admin() then
    raise exception 'Sólo un admin de Avance físico puede asignar obras.' using errcode = '42501';
  end if;
  if not exists (select 1 from public."Usuarios_Auth" where id = p_usuario_id) then
    raise exception 'El usuario indicado no existe.' using errcode = 'P0002';
  end if;

  if coalesce(p_habilitado, false) then
    if not exists (select 1 from public."Datos_Licitaciones" where id_licitacion::text = p_licitacion_id::text) then
      raise exception 'La obra % no existe.', p_licitacion_id using errcode = 'P0002';
    end if;
    insert into "Mobile".reports_users_licitaciones (user_id, licitacion_id)
    select p_usuario_id, p_licitacion_id
    where not exists (
      select 1 from "Mobile".reports_users_licitaciones
      where user_id = p_usuario_id and licitacion_id = p_licitacion_id
    );
  else
    delete from "Mobile".reports_users_licitaciones
    where user_id = p_usuario_id and licitacion_id = p_licitacion_id;
  end if;
end;
$$;

create or replace function public.avance_fisico_set_rol(p_usuario_id uuid, p_role_id bigint)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.avance_fisico_es_admin() then
    raise exception 'Sólo un admin de Avance físico puede cambiar roles.' using errcode = '42501';
  end if;
  if p_role_id is not null and not exists (
    select 1 from public."Usuarios_Roles"
    where id = p_role_id
      and "Aplicacion" = 'Mobile'
      and lower(rol) in ('admin', 'admin_gerencia', 'engineer', 'sobrestante')
  ) then
    raise exception 'El rol % no es de Avance físico.', p_role_id using errcode = '23514';
  end if;

  if p_role_id is null then
    update public."Usuarios_Auth"
    set role_mobile = null, mobile_manage_visible = false
    where id = p_usuario_id;
  else
    update public."Usuarios_Auth"
    set role_mobile = p_role_id, mobile_manage_visible = true
    where id = p_usuario_id;
  end if;

  if not found then
    raise exception 'El usuario indicado no existe.' using errcode = 'P0002';
  end if;

  if p_role_id is null then
    delete from "Mobile".reports_users_licitaciones where user_id = p_usuario_id;
  end if;
end;
$$;

revoke all on function public.avance_fisico_set_obra(uuid, bigint, boolean) from public, anon;
grant execute on function public.avance_fisico_set_obra(uuid, bigint, boolean) to authenticated;

commit;

-- Control: deben aparecer avance_fisico_es_admin, set_obra, set_rol y set_visible.
select p.proname, p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'avance_fisico_%'
order by p.proname;
