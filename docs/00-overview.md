# Bencen Mobile - Overview

## Stack

- Frontend: React 19 + Vite
- UI: Tailwind utility classes
- Backend/data: Supabase
- Charts: Recharts
- Images: `browser-image-compression` + Supabase Storage

## Main app modes

- `engineer` / `sobrestante`
  - Select a project
  - Browse plan items
  - Open item history
  - Report progress with optional photos
- `admin` / `admin_gerencia`
  - Use `AdminDashboard`
  - Filter by project
  - See KPIs, recent activity, feed, full plan, planning views
  - Open item history from admin detail views

## Entry flow

Main entry is [App.jsx](/c:/Users/gmassariol/Documents/Workspace%20VSCode/Bencen_Mobile_Fork/src/App.jsx).

High-level flow:

1. Read Supabase auth session.
2. Resolve user profile from `reports_users`.
3. Resolve role name through `usuarios_roles`.
4. Route:
   - no session -> `Login`
   - profile without role -> pending screen
   - `admin` / `admin_gerencia` -> `AdminDashboard`
   - other mobile roles -> project selector / item flow

## Main UI pieces

- [App.jsx](/c:/Users/gmassariol/Documents/Workspace%20VSCode/Bencen_Mobile_Fork/src/App.jsx)
  - Session handling
  - User-scoped local persistence
  - Midnight reset/logout
- [ProjectSelector.jsx](/c:/Users/gmassariol/Documents/Workspace%20VSCode/Bencen_Mobile_Fork/src/components/ProjectSelector.jsx)
  - Shows projects assigned to the current user
- [ItemsList.jsx](/c:/Users/gmassariol/Documents/Workspace%20VSCode/Bencen_Mobile_Fork/src/components/ItemsList.jsx)
  - Engineer-facing plan tree
  - Opens history modal per item
- [HistoryModal.jsx](/c:/Users/gmassariol/Documents/Workspace%20VSCode/Bencen_Mobile_Fork/src/components/HistoryModal.jsx)
  - Shows item history
  - Opens add/edit progress modal
  - Compares real vs planned progress
- [ProgressModal.jsx](/c:/Users/gmassariol/Documents/Workspace%20VSCode/Bencen_Mobile_Fork/src/components/ProgressModal.jsx)
  - Report/edit progress
  - Quantity <-> percent conversion
  - Date range and observation validation
  - Photo upload
- [AdminDashboard.jsx](/c:/Users/gmassariol/Documents/Workspace%20VSCode/Bencen_Mobile_Fork/src/components/AdminDashboard.jsx)
  - Top-level admin shell
  - Project selector persistence
  - User management modals
  - Notification / recent activity feed
- [ProjectDetailDashboard.jsx](/c:/Users/gmassariol/Documents/Workspace%20VSCode/Bencen_Mobile_Fork/src/components/admin/ProjectDetailDashboard.jsx)
  - Detailed admin analytics for one project
  - Uses history modal and chart modal
  - Persists active tab / expanded groups / planning filters per project

## API layer

All frontend data access is centralized in [api.js](/c:/Users/gmassariol/Documents/Workspace%20VSCode/Bencen_Mobile_Fork/src/services/api.js).

Important characteristics:

- The frontend treats `partes_diarios.avance` as percentage points from `0..100`.
- Item quantity is a UX helper derived from the plan item total.
- User/role source is `reports_users`, not `mobile_users`.
- Most dashboards aggregate data on the client after querying Supabase tables/views.

## Persistence currently used

Local persistence is based on `localStorage` keys prefixed with `bencen_`.

Important behavior:

- Keys are now scoped by `user.id` for selected project and admin project state.
- At midnight local time the app clears `bencen_*` keys and logs the user out.
- On session end/logout, the same cleanup is performed.
