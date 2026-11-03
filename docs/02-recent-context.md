# Recent Context And Decisions

This file captures the recent decisions made in the project so a later conversation can recover context quickly.

## 1. Progress quantity vs percent

Problem observed:

- When a user entered quantity for an item, the linked percent field could produce many decimals.
- Because the input had `step="0.01"`, the browser showed a validation error.
- Example case: total `966`, quantity `230`, percent became a repeating decimal.

What was done:

- In [ProgressModal.jsx](/c:/Users/gmassariol/Documents/Workspace%20VSCode/Bencen_Mobile_Fork/src/components/ProgressModal.jsx):
  - linked UI values are rounded for display to 2 decimals
  - when quantity is present, the exact percent ratio is persisted on save

Why it matters:

- The UI stays valid for numeric inputs.
- The saved percentage remains mathematically correct.
- History reconstructs quantity without drifting to values like `230,005`.

## 2. Migration away from `mobile_users`

Problem observed:

- Some users could log in but failed to insert into `partes_diarios` because the DB still referenced `mobile_users`.
- The project had already conceptually moved to `reports_users`.

What was done:

- App code was migrated to use `reports_users`.
- `partes_diarios` report author fetches now use `reporter:reports_users(...)`.
- Legacy fallbacks to `mobile_users` were removed from the frontend.
- Migration file was added:
  - [20260311_replace_mobile_users_with_reports_users.sql](/c:/Users/gmassariol/Documents/Workspace%20VSCode/Bencen_Mobile_Fork/supabase/migrations/20260311_replace_mobile_users_with_reports_users.sql)

Operational note:

- In Supabase, `mobile_users` could not be dropped until all constraints/policies depending on it were removed or rewritten.

## 3. Recent activity feed formatting

Problem observed:

- The recent activity dropdown showed only hour even for previous days.
- Percent values could show too many decimals.

What was done:

- In [NotificationFeed.jsx](/c:/Users/gmassariol/Documents/Workspace%20VSCode/Bencen_Mobile_Fork/src/components/admin/NotificationFeed.jsx):
  - if the record is from today, show only hour
  - if it is older, show date + hour
  - displayed progress is formatted with max 2 decimals

## 4. Mobile layout fixes

### Admin header

Problem:

- In mobile width, the project selector disappeared from the admin header.

Fix:

- The selector was moved below the title on mobile.
- The header now grows in height only when needed on small screens.

### User management modal

Problem:

- In mobile width, controls were clipped horizontally.

Fix:

- User cards now stack vertically on small screens.
- Name/email wrap correctly.
- Action buttons/selects become full-width in mobile.

## 5. Project detail history modal persistence

Problem:

- Closing item history inside admin project detail triggered a data reload every time, even when the user only viewed the modal.

Fix:

- Added a dirty-state flag in [ProjectDetailDashboard.jsx](/c:/Users/gmassariol/Documents/Workspace%20VSCode/Bencen_Mobile_Fork/src/components/admin/ProjectDetailDashboard.jsx).
- Parent data is refreshed only if add/edit/delete actually happened in the modal.

## 6. User-scoped persistence and midnight reset

Problem:

- Selected project persistence was global in localStorage.
- Settings could leak between users on the same browser.
- There was no daily reset.

Fix:

- In [App.jsx](/c:/Users/gmassariol/Documents/Workspace%20VSCode/Bencen_Mobile_Fork/src/App.jsx):
  - localStorage keys are now scoped by `session.user.id`
  - all `bencen_*` keys are cleared on logout/session end
  - a midnight timer logs the user out and resets local state/configuration
- In [AdminDashboard.jsx](/c:/Users/gmassariol/Documents/Workspace%20VSCode/Bencen_Mobile_Fork/src/components/AdminDashboard.jsx):
  - selected admin project and detailed-view flag are persisted per user

## 7. Practical operational reminders

- `partes_diarios.avance` is always percentage points, not fraction.
- Historical “punto 0” inserts should use:
  - valid `item_id`
  - valid `reports_users.id` in `user_id`
  - correct percent in `avance`
- If a user can authenticate but cannot report progress, first verify:
  - row exists in `reports_users`
  - role exists in `usuarios_roles`
  - `partes_diarios.user_id` FK points to `reports_users`

## Seguridad REST Supabase
Regla obligatoria: despues de un login exitoso, todas las llamadas REST internas de la app deben usar el token autenticado de sesion del usuario (`access_token`).
Nunca usar la clave ANON en el header `Authorization` para operaciones REST post-login.
La clave ANON solo puede usarse como `apikey` y para flujos de autenticacion inicial (login/refresh), no como bearer token de datos.

## 8. Alta de usuario sin aprobacion de Gerencia (2026-11-03)

- `CreateUserModal` en `AdminDashboard.jsx` lista todos los usuarios de `Usuarios_Auth` sin `role_mobile`.
- Se elimino el filtro `mobile_admin_visible = true` y el modal "Ajustes de Gerencia" que lo marcaba: el admin elige el usuario y asigna el rol directamente.
- La columna `mobile_admin_visible` sigue existiendo; "Quitar acceso" en Gestion de Usuarios la sigue poniendo en `false`, pero ya no afecta el alta.

## 9. Home de cartera para admin/gerencia (2026-11-03)

- `AdminDashboard` ya no muestra una obra por vez con selector: la home es `admin/PortfolioHome.jsx`.
- Datos: `api.getPortfolioOverview()` trae todas las obras activas en 4 consultas paginadas (plan, partes_diarios, periodos, avances estimados).
- Real = `sum(partes_diarios.avance)` por item (tope 100). Plan a hoy = `sum(avance_estimado * 100)` de periodos vencidos; el periodo en curso cuenta proporcional a los dias transcurridos.
- Switch "Por $" (PU x cantidad) / "Por items" (peso igual). Si la obra no tiene precios, "Por $" cae a items y lo avisa.
- Estado: Atrasada <= -10 pp, Atencion <= -3 pp, Sin plan si no hay avance estimado. "Sin reportes" = ultimo reporte hace mas de 7 dias.
- Se eliminaron `AdminMetrics.jsx` y `getDashboardMetrics`/`getWeeklyActivity`/`getProjectFinancials` (la home vieja).

## 10. Escritura de usuarios por funciones (Fase 2-C, 2026-11-03)

- Desde la Fase 2-B del Portal (2026-10-29) el navegador no puede escribir `Usuarios_Auth` ("permission denied for table Usuarios_Auth").
- Alta, cambio de rol, quitar acceso y ocultar usuario usan ahora `rpc('avance_fisico_set_rol')` y `rpc('avance_fisico_set_visible')`, que exigen rol Mobile admin/admin_gerencia.
- SQL: `supabase/migrations/20261103_avance_fisico_funciones_usuarios.sql` (hay que correrlo en Supabase antes de publicar).
- Los roles se leen filtrando `Usuarios_Roles."Aplicacion" = 'Mobile'`.
- Asignar obras: `toggle_permission` quedo sin ejecucion desde `Portal/SQL_SEGURIDAD_URGENTE_2026_10_29.sql` (no controlaba quien la llamaba). La reemplaza `rpc('avance_fisico_set_obra', { p_usuario_id, p_licitacion_id, p_habilitado })`; quitar el rol tambien borra las obras asignadas en el servidor. SQL: `supabase/migrations/20261103b_avance_fisico_obras_usuario.sql`.
- `Mobile.reports_users_licitaciones` cerrada (aplicado 2026-11-03, `supabase/migrations/20261103c_cerrar_reports_users_licitaciones.sql`): lectura de las propias filas o admin de Avance fisico; sin escritura desde el navegador.
- `ProjectSelector` revalida siempre la lista de obras (antes un cache vacio quedaba hasta logout/medianoche) y muestra el error de carga en vez de "No tenes obras asignadas".
