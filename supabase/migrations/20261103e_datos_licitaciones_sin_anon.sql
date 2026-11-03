-- Fase 2-C quater (2026-11-03): Datos_Licitaciones se podía leer entera sin iniciar sesión
-- (clave anon): "Enable read access for all users" (public, true) y "anon_read_datos_licitaciones"
-- (anon + authenticated, true). La restricción de oficina sólo aplica a authenticated.
-- Revisado en código: ninguna app la lee sin login (backends usan service role; Portal
-- subcontratistas usa el token del usuario; el resto lee logueado).
-- La lectura logueada queda cubierta por oficina_lectura_licitaciones (20261103d).
-- No cambia datos. Idempotente y transaccional.

begin;
drop policy if exists "Enable read access for all users" on public."Datos_Licitaciones";
drop policy if exists anon_read_datos_licitaciones on public."Datos_Licitaciones";
commit;

-- Control: no debe quedar ninguna política de lectura con anon ni public.
select policyname, permissive, roles, qual
from pg_policies
where schemaname = 'public' and tablename = 'Datos_Licitaciones' and cmd in ('SELECT', 'ALL')
order by policyname;
