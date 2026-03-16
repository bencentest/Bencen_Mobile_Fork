# Data Model And Cross-Table Notes

This file summarizes the tables the app depends on most heavily.

## Identity and roles

### `reports_users`

Primary mobile user profile table.

Relevant fields used by the app:

- `id`
  - Expected to match Supabase auth user id
- `email`
- `name`
- `role_mobile`
  - Foreign key / logical link to `usuarios_roles.id`
- `mobile_admin_visible`
  - Used in admin approval / visibility flows
- `mobile_manage_visible`
  - Used to hide/show users in admin user management

### `usuarios_roles`

Role catalog.

Relevant fields:

- `id`
- `rol`

Current role names used in code:

- `admin`
- `admin_gerencia`
- `engineer`
- `sobrestante`

## Project and plan structure

### `datos_licitaciones`

Project master list.

Used fields:

- `id_licitacion`
- `nombre_abreviado`
- `obra_activa`

### `datos_licitaciones_plan_trabajo`

Plan item structure for a project.

Used fields:

- `id`
- `id_licitacion`
- `orden`
- `grupo`
- `subgrupo`
- `grupo_parent`
- `subgrupo_parent`
- `item`
- `descripcion`
- `unidad`
- `cantidad`
- cost fields in admin flows:
  - `pu_mod_mo`
  - `pu_mod_mat`
  - `pu_mod_eq`

Important note:

- Rows with `grupo` or `subgrupo` are used as tree structure nodes.
- Leaf items are rows where neither `grupo` nor `subgrupo` is set.

## Progress reporting

### `partes_diarios`

This is the core operational table for real progress loaded from mobile.

Used fields:

- `id`
- `item_id`
- `id_licitacion`
- `avance`
- `fecha`
- `fecha_inicio`
- `fecha_fin`
- `observaciones`
- `photos`
- `created_at`
- `user_id`

Important semantics:

- `avance` is stored as a percentage value in `0..100`.
- `avance` is not a fraction. `100` means fully complete, not `1`.
- A single item can have multiple rows in `partes_diarios`.
- Effective item progress is usually `sum(avance)` capped visually around completion.
- Quantity shown in UI is derived from:
  - `cantidad_item_total * avance / 100`

### `datos_licitaciones_avances`

Planned/estimated progress table used for comparison charts and windows.

Used fields:

- `id_licitacion`
- `id_item`
- `id_periodo`
- `avance_real`
- `avance_estimado`

Usage:

- Drives estimated curves in item history
- Drives planned windows
- Drives admin comparison charts

### `datos_licitaciones_periodos`

Period definitions for planning.

Used fields:

- `id`
- `id_licitacion`
- `orden`
- `periodo`
- `fecha_desde`
- `fecha_hasta`

## Access and project assignment

### `reports_users_licitaciones`

User-to-project permissions.

Used fields:

- `user_id`
- `licitacion_id`

Used to restrict non-admin users to their assigned projects.

## Storage

### Supabase Storage bucket: `report-evidence`

Used by `api.uploadImage()` for image evidence attached to progress reports.

## Migration note: `mobile_users`

`mobile_users` was a legacy table and should no longer be used by the app.

Current code expects:

- roles from `reports_users.role_mobile`
- report author relation from `partes_diarios -> reports_users`

Migration file added for this transition:

- [20260311_replace_mobile_users_with_reports_users.sql](/c:/Users/gmassariol/Documents/Workspace%20VSCode/Bencen_Mobile_Fork/supabase/migrations/20260311_replace_mobile_users_with_reports_users.sql)

## Query patterns that matter

### Engineer flow

1. Get projects with `api.getLicitaciones()`
2. Get plan items with `api.getItems(id_licitacion)`
3. Get current progress map with `api.getActiveItemIds(id_licitacion)`
4. Open item history with `api.getItemHistory(item.id)`
5. Insert/update/delete `partes_diarios`

### Admin flow

1. Load dashboard project list with `api.getLicitaciones()`
2. Load summary metrics with `api.getDashboardMetrics(projectId)`
3. Load project detail data with `api.getProjectDetails(projectId)`
4. Open item history from feed / plan / ranking
5. Refresh parent detail only if the history modal actually changed data
