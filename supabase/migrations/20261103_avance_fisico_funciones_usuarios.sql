-- Fase 2-C (2026-11-03): Avance físico (data.bencen, Bencen_Mobile_Fork) deja de escribir
-- Usuarios_Auth desde el navegador. La Fase 2-B (Portal/SQL_FASE2_B_CERRAR_TABLAS.sql) revocó
-- insert/update/delete sobre Usuarios_Auth para authenticated, así que el alta, el cambio de rol,
-- quitar acceso y ocultar usuario fallaban con "permission denied for table Usuarios_Auth".
--
-- Mismo patrón que la Fase 2-A: funciones security definer que exigen que quien llama sea
-- admin o admin_gerencia de Mobile. Sólo asignan roles de Avance físico
-- (admin, admin_gerencia, engineer, sobrestante) del catálogo Mobile.
-- Ojo: role_mobile es compartido con Solicitudes; asignar un rol acá también lo ve Solicitudes.
--
-- Sólo crea funciones: no cambia datos ni políticas. Transaccional.

begin;

create or replace function public.avance_fisico_es_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public."Usuarios_Auth" ua
    join public."Usuarios_Roles" r on r.id::text = ua.role_mobile::text
    where ua.id = auth.uid()
      and r."Aplicacion" = 'Mobile'
      and lower(r.rol) in ('admin', 'admin_gerencia')
  );
$$;

-- Asigna (o quita, con p_role_id null) el rol de Avance físico de una persona.
-- Al asignar, la persona queda visible en "Gestionar usuarios"; al quitar, se limpia la marca de alta.
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
end;
$$;

-- Muestra u oculta a una persona en "Gestionar usuarios" (la UI lo ofrece a admin_gerencia).
create or replace function public.avance_fisico_set_visible(p_usuario_id uuid, p_visible boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.avance_fisico_es_admin() then
    raise exception 'Sólo un admin de Avance físico puede cambiar la visibilidad.' using errcode = '42501';
  end if;

  update public."Usuarios_Auth"
  set mobile_manage_visible = coalesce(p_visible, false)
  where id = p_usuario_id;

  if not found then
    raise exception 'El usuario indicado no existe.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.avance_fisico_es_admin() from public, anon;
revoke all on function public.avance_fisico_set_rol(uuid, bigint) from public, anon;
revoke all on function public.avance_fisico_set_visible(uuid, boolean) from public, anon;
grant execute on function public.avance_fisico_es_admin() to authenticated;
grant execute on function public.avance_fisico_set_rol(uuid, bigint) to authenticated;
grant execute on function public.avance_fisico_set_visible(uuid, boolean) to authenticated;

commit;

-- Control: las tres funciones deben aparecer, todas security definer.
select p.proname, p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'avance_fisico_%'
order by p.proname;
