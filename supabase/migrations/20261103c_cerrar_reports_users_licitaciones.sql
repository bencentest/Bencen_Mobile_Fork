-- Fase 2-C (2026-11-03), aplicado en Supabase el 2026-11-03.
-- "Mobile".reports_users_licitaciones tenía una sola política ALL para authenticated con using (true):
-- cualquier usuario logueado podía asignarse o quitarse cualquier obra (Avance físico y Solicitudes).
-- Lectura: cada uno sus filas; los admin de Avance físico, todas (Gestionar usuarios).
-- Escritura: sólo por public.avance_fisico_set_obra / avance_fisico_set_rol (security definer).
-- Solicitudes y Backend_Catalogo_Servicios sólo leen las filas del propio usuario: no se afectan.

begin;
drop policy if exists "reports_users_licitaciones" on "Mobile".reports_users_licitaciones;
create policy "reports_users_licitaciones_lectura" on "Mobile".reports_users_licitaciones
  for select to authenticated
  using (user_id = auth.uid() or public.avance_fisico_es_admin());
revoke insert, update, delete on "Mobile".reports_users_licitaciones from anon, authenticated;
commit;
