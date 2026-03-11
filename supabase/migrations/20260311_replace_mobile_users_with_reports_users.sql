-- Backfill roles from legacy mobile_users into reports_users when possible.
update public.reports_users ru
set role_mobile = ur.id
from public.mobile_users mu
join public.usuarios_roles ur
  on lower(ur.rol) = lower(mu.role)
where ru.id = mu.id
  and ru.role_mobile is null;

-- Move partes_diarios foreign key from mobile_users to reports_users using the same source column.
do $$
declare
    fk_name text;
    fk_column text;
begin
    select c.conname, a.attname
    into fk_name, fk_column
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join unnest(c.conkey) with ordinality as cols(attnum, ord) on true
    join pg_attribute a on a.attrelid = t.oid and a.attnum = cols.attnum
    where n.nspname = 'public'
      and t.relname = 'partes_diarios'
      and c.contype = 'f'
      and c.conname = 'fk_partes_diarios_mobile_users'
    limit 1;

    if fk_name is not null and fk_column is not null then
        execute format('alter table public.partes_diarios drop constraint %I', fk_name);
        execute format(
            'alter table public.partes_diarios add constraint fk_partes_diarios_reports_users foreign key (%I) references public.reports_users(id)',
            fk_column
        );
    end if;
end $$;

drop policy if exists "Authenticated users can read mobile_users" on public.mobile_users;
drop table if exists public.mobile_users;
