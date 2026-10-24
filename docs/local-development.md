# Local development

Run commands from the workspace root, `D:\RMS`, unless a command says otherwise. Do not commit real `.env` files. Copy the examples and fill them in locally.

## Install

```powershell
npm run install:all
```

That installs `backend`, `admin-web`, and `desktop-pos`. `mobile-app` is not configured as a runnable application yet.

## Environment

Backend example: `backend/.env.example`

Required:

- `PORT`
- `NODE_ENV` (`development`, `test`, or `production`)
- `MONGODB_URI` (`MONGO_URI` is still accepted)
- `CORS_ORIGINS` (comma-separated; `FRONTEND_URL` is still accepted)

Admin example: `admin-web/.env.example`

- Leave `VITE_API_URL` unset to use the Vite proxy and the default base path `/api/v1`.
- Set `VITE_API_URL` only when the browser should call the API directly. Include the `/api/v1` prefix.
- `VITE_API_PROXY_TARGET` changes the dev proxy target. The default is `http://127.0.0.1:5000`.

The existing backend `.env` is local and must not be committed. Session settings are described in `docs/authentication.md`. `SESSION_SECRET` must be at least 32 characters.

Create the first administrator only with:

```powershell
npm run bootstrap:admin --prefix backend
```

The API does not create that account or a company on startup.

Link that identity to a company, system roles, and the company super admin membership:

```powershell
npm run bootstrap:company --prefix backend
```

For local development only, five draft placeholder branches can be added after the company exists. The command skips codes that already exist and does not activate them:

```powershell
npm run seed:dev-branches --prefix backend
```

`npm run report:ownership --prefix backend` lists branches that have no company. It does not modify them. Details are in `docs/access-control.md`.

## MongoDB

The API listens even when MongoDB is down. `GET /api/v1/health` can still return success. `GET /api/v1/health/ready` returns HTTP 503 until a ping succeeds.

This machine has a Windows service named `MongoDB`, configured to start automatically and using the database files under MongoDB's installed data directory. If it is stopped, open PowerShell as Administrator and run:

```powershell
Start-Service -Name MongoDB
Get-Service -Name MongoDB
```

Do not start another `mongod` with `D:\RMS\.mongo-data` as its data path unless you deliberately want a separate database. That folder does not contain the service's database, so switching to it can make existing users and application data appear missing.

Default database URI used by the example file:

```text
mongodb://127.0.0.1:27017/rms
```

## Start

From the workspace root, start MongoDB (if it is stopped) and run the backend and Admin together:

```powershell
npm run dev
```

This command starts both the API and Admin and stops the other if either process fails. `npm run dev:backend` and `npm run dev:admin` are still available when you need to start either process separately.

- Desktop POS: `npm run dev:desktop` (starts Vite and Electron together)
- Backend: `http://127.0.0.1:<PORT>` (default `5000`)
- Liveness: `http://127.0.0.1:<PORT>/api/v1/health`
- Readiness: `http://127.0.0.1:<PORT>/api/v1/health/ready`
- Admin: `http://localhost:3000`

The Admin Vite proxy and copied Desktop POS backend URL use the backend's `PORT` from `backend/.env` when set, otherwise port 5000. If `VITE_API_PROXY_TARGET` or `VITE_DESKTOP_BACKEND_URL` is explicitly set, that value takes precedence. Restart Admin after changing these values. Use the same configured port in Desktop POS (for example, `http://127.0.0.1:5001`); adding `/api/v1` is optional because Desktop POS normalizes it automatically.

On first launch, open the branch in Admin and select **API integration**. The **Desktop POS Backend URL** field shows the configured API address and can be copied. Select **Generate key** for a branch without an active key, or **Rotate key** to replace its current key. Copy the full branch key when it is issued and paste the URL and key into Desktop POS; the secret cannot be retrieved later. Each branch has its own key, and rotating a key immediately invalidates the previous one. The desktop checks the key against the branch menu before saving connection changes, so an invalid key will not overwrite the last saved credentials. Menu items, orders, payments, and cash sessions are limited to the branch that issued the key. Publish the branch menu with the required order channels and configure an active POS terminal in the admin application before opening a cash session.

After saving the connection, sign in with the **email and password** shown/set in the branch's **Integrations → Desktop POS sign-in** panel. Initially, these are the **Admin Login Email** and **Initial Password** entered in the **Branch login account** section when the branch was created. The branch contact email and Desktop POS API key are not user login credentials. Passwords are hashed and cannot be retrieved; an authorized POS manager can set a new password there if the original is unknown. The new password replaces the old one and invalidates existing sessions for that account. Desktop POS does not save login credentials and asks for them again after sign-out or restart. Signing out destroys the login session but keeps the encrypted backend URL and branch API key on the computer, so initial setup is not required again.

Desktop POS requires Node.js 22.12 or later for its patched Electron runtime. Use HTTPS for remote backend URLs; HTTP is accepted only for localhost development.

`npm start --prefix backend` runs the API without nodemon.

## Checks

```powershell
npm run test:backend
npm run build:admin
npm run build:desktop
```

There is no lint script in the existing admin or backend packages.

## Operational apps

`mobile-app` remains a scaffold. `desktop-pos` runs as a React/Vite renderer inside Electron.

## Production responses

`NODE_ENV=production` hides internal error messages and stack traces. Request ids are still returned. Database credentials and connection strings are not part of health responses.
