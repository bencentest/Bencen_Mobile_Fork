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
