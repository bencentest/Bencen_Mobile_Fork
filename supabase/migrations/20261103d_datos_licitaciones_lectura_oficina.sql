-- Fase 2-C ter (2026-11-03). Dos correcciones:
--
-- 1) Datos_Licitaciones (obras) la leen todas las apps de oficina: Avance físico, Solicitudes,
--    Portal (Obras activas), LicitApp, Seguimientos. Seguimientos
--    (Seguimientos/sql/2026-08-11_rls_seguimientos.sql) le puso una restricción de lectura que sólo
--    deja pasar a quien tiene rol en LicitApp o en Pólizas: un ingeniero o sobrestante nuevo con rol
--    sólo en Mobile veía cero obras.
--    Ahora lee quien es usuario de oficina (tiene fila en Usuarios_Auth). El personal de SOM no
--    está en Usuarios_Auth, así que sigue afuera. Escritura (alta/cambio/baja): sin cambios, LicitApp.
--    Si alguien vuelve a correr el SQL de Seguimientos, hay que volver a correr éste.
--
-- 2) avance_fisico_set_rol escribía mobile_admin_visible (no existe) al quitar el rol: fallaba con
--    "column does not exist". La columna es mobile_manage_visible.
--
-- Idempotente y transaccional. No cambia datos.

begin;

create or replace function public.es_usuario_oficina()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
     and exists (select 1 from public."Usuarios_Auth" ua where ua.id = auth.uid());
$$;

revoke all on function public.es_usuario_oficina() from public, anon;
grant execute on function public.es_usuario_oficina() to authenticated;

drop policy if exists oficina_lectura_licitaciones on public."Datos_Licitaciones";
create policy oficina_lectura_licitaciones
on public."Datos_Licitaciones"
as permissive for select to authenticated
using ((select public.es_usuario_oficina()));

drop policy if exists seguimientos_guard_licitaciones_select on public."Datos_Licitaciones";
create policy seguimientos_guard_licitaciones_select
on public."Datos_Licitaciones"
as restrictive for select to authenticated
using ((select public.es_usuario_oficina()));

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

commit;

-- Control (sólo lectura): políticas de lectura de Datos_Licitaciones.
select policyname, permissive, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'Datos_Licitaciones' and cmd in ('SELECT', 'ALL')
order by policyname;
