# Authentication

Part 2 identifies people and keeps server-side sessions. It does not decide which company or branch a person may access. That is Part 3.

## Identity

There is one user collection. Email is trimmed and stored in lowercase, with a unique index. Passwords are hashed with Argon2id. Older bcrypt hashes still verify, and a successful login replaces them with Argon2id. The hash is never returned by the API or written to logs.

Identity fields used by this part:

- `name`
- `email` (normalized)
- `passwordHash`
- `status`: `active` or `disabled`
- `lastLoginAt`
- `passwordChangedAt`
- `authVersion`
- `createdAt` and `updatedAt`

Existing `role`, `branchId`, and `permissions` fields remain on the document. Part 2 does not treat them as authorization.

## Sessions

Login creates an opaque session id in an HttpOnly cookie. The session record is stored in MongoDB by `connect-mongo`. There is no JWT login and no token in browser storage.

Cookie settings:

- Name: `SESSION_COOKIE_NAME` (default `rms.sid`)
- `HttpOnly`: true
- `Secure`: true when `NODE_ENV` is `production`
- `SameSite`: `Lax`
- `Path`: `/`
- Lifetime: `SESSION_TTL_MINUTES` (default 480)

Local development uses the Vite proxy, so the admin app and API share `http://localhost:3000`. `SameSite=Lax` works for that same-site arrangement. Do not point the browser at `http://127.0.0.1:5000` directly. That is a different origin and these cookies will not be sent.

Production should keep the admin app and API on one site. `SameSite=None` is not used. `TRUST_PROXY` stays empty unless a reverse proxy is actually in front of the API, and then it must be the hop count, such as `1`.

Login regenerates the session id. Logout destroys that session and clears the cookie. Logout can be repeated when no session exists.

Every authenticated request checks that the session has not passed `expiresAt`, that the user is still `active`, and that `session.authVersion` still equals the user's `authVersion`. Logout-all and password change increment `authVersion` in the same update as the password when the password changes. Older sessions fail immediately. MongoDB TTL deletion is only cleanup.

## CSRF

`GET /api/v1/auth/csrf` stores a token on the session and returns it. State-changing requests send it in the `X-CSRF-Token` header. Login, logout of an active session, logout-all, and password change require a matching token. A missing or wrong token returns HTTP 403. The client does not retry a failed state change automatically.

## Endpoints

- `GET /api/v1/auth/csrf`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`
- `POST /api/v1/auth/change-password`

Unknown users, wrong passwords, and disabled accounts all return `Invalid email or password.` Login attempts are limited by client IP and normalized email. The limiter is in memory, so it applies to a single API process. Several API instances would each count separately until a shared store is added. The limit slows guessing. It does not permanently lock the account.

Restaurant routes other than authorized branch reads respond with HTTP 403 and do not return business data. A session is not permission to use them. Company and branch rules are in `docs/access-control.md`.

## Admin application

On startup the admin app calls `/auth/me` before showing the console. The screen stays on “Checking session” until that call finishes. A network failure shows a retry action and does not send the user through a login loop. Invalid credentials stay on the login form. After login, the app returns only to an internal `/admin` path. External and protocol-relative targets are ignored.

The branch selector lists only branches returned by the access context. It does not use fallback branch data.

## Bootstrap

Public registration is not available. The API does not create an administrator when it starts.

From `backend`:

```powershell
npm run bootstrap:admin
```

The command prompts for name, email, and a hidden password. It refuses extra arguments, refuses to overwrite an existing email, and exits if MongoDB is unavailable. The new user is only an identity. Company membership is created separately with `npm run bootstrap:company`.

## Logs

Auth logs include the event name, time, request id, and user id when one exists. They do not include passwords, hashes, session ids, cookies, or CSRF tokens.

## Part 3

Company ownership, roles, and branch access are in effect. See `docs/access-control.md`.
