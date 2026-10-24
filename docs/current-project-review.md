# Current project review

Reviewed before the Part 1 foundation changes. Secret values from local environment files are not recorded here.

## What currently exists

The workspace is not a Git repository. There is no root `AGENTS.md`. Applications already live in separate folders, and those folders were left in place so existing imports, Vite config, and scripts keep working.

| Path | Role |
| --- | --- |
| `admin-web/` | Super admin console. React 18 and Vite 6. Client-side path switching in `App.jsx`, not React Router. Tailwind is loaded from the page template. |
| `backend/` | Express 4 API with Mongoose 8. Entry point is `backend/server.js`. Business modules already exist for auth, branches, employees, menu, inventory, recipes, orders, tables, payments, and expenses. |
| `desktop-pos/` | Electron and POS scaffold. `package.json` has no dependencies and no start script. Screen components are stubs. |
| `mobile-app/` | React Native style scaffold. `package.json` has no dependencies and no start script. Navigation and API files are stubs. |
| `docs/` | Added in Part 1. |

The target names `admin/` and `frontend/` were not created by moving these folders. `admin-web` is the admin console. `desktop-pos` and `mobile-app` are the future operational and customer interfaces.

There is no hardcoded limit of five branches in application source. Branch count is data, not a constant.

## Pages and data sources

The admin shell always renders the sidebar, top bar, and branch selector after a successful sign-in. Sign-in is an existing screen and is out of scope for new work in Part 1. Unsigned visitors see the login screen, which now also shows backend connection status.

| Area | Data source |
| --- | --- |
| Dashboard, branches, employees, menu, inventory, recipes, orders, kitchen tickets, tables | `AppStore` calls the existing authenticated APIs when a session token is present. Empty collections stay empty. They are not filled with sample restaurants. |
| Expenses, suppliers, notifications, audit logs, accounting ledgers | Local component or store state. These screens are visual shells. They are not a live reporting feed. |
| Login, forgot password, reset password | Existing `admin-web/src/services/auth.api.js` calls `/auth/*`. |
| Connection status | New client calls `GET /api/v1/health` and `GET /api/v1/health/ready`. |

Dashboard cards say **Not connected yet** until branch, order, or menu records have actually been loaded. Loaded records are API results, not fabricated metrics.

`admin-web/src/services/api.js` already stored the session token in `localStorage`. Part 1 did not add a new token store. That existing storage is not treated as the Part 1 authentication design.

## What was missing or broken before Part 1

- Express app creation and process startup lived in one file, so the API could not be tested without listening.
- `GET /api/health` mixed liveness and database status and returned 503 when MongoDB was down, so the process could not report liveness during an outage.
- Startup aborted when the initial database connection failed, so readiness could not be queried after a failed boot.
- Required settings fell back to local defaults, including a built-in JWT secret and administrator password.
- CORS allowed one `FRONTEND_URL` rather than an explicit origin list.
- Responses had no request id. Error JSON did not use a stable `error.code`.
- The admin client defaulted to `/api` and did not surface liveness versus database readiness.
- No automated tests and no root install or start scripts.
- No architecture or local setup documents.
- MongoDB is installed as a Windows service but was stopped at review time. Redis is optional and is not required to boot the API.
- `companyId` does not exist on current models. Branch access checks in the existing middleware are not the Part 1 authorization contract.
- `desktop-pos` and `mobile-app` cannot be started.

## Conventions to preserve

- JavaScript for the backend. The admin UI already mixes `.jsx` and `.tsx`; do not migrate the project to TypeScript.
- Vite for `admin-web`. Do not replace the build tool.
- Existing dependency major versions.
- Backend entry remains `backend/server.js`. Shared connection helpers stay importable from `backend/config/db.js`.
- Existing business routers stay mounted. They already require a bearer token except the existing login and password-reset routes. Part 1 does not add new business CRUD.
- Canonical API prefix is `/api/v1`. `/api` remains mounted so current relative calls keep working.
- Admin API base URL comes from `VITE_API_URL`, or `/api/v1` when that variable is unset. The Vite dev server proxies `/api` to the backend.

## Minimal Part 1 changes

- Split application setup from process startup.
- Validate `MONGODB_URI` (or `MONGO_URI`) and `CORS_ORIGINS` (or `FRONTEND_URL`) before listening.
- Keep the process up when MongoDB is down. Liveness stays available. Readiness returns 503.
- Add request ids, security headers, a 1 MB JSON limit, and production-safe error bodies.
- Show connection status and a retry action in the admin top bar and on the login screen.
- Document the future company and branch ownership rules without claiming they are enforced.
