# Development progress

Parts 1 through 4 are complete. Later parts are not started.

| Part | Name | Status |
| --- | --- | --- |
| 1 | Project review and application foundation | Complete |
| 2 | Authentication and sessions | Complete |
| 3 | Company ownership, roles and branch access | Complete |
| 4 | Branch setup and onboarding | Complete |
| 5 | Staff, shifts and attendance | Not started |
| 6 | Company menu catalog | Not started |
| 7 | Branch menus and publishing | Not started |
| 8 | Kitchens, stations and routing | Not started |
| 9 | Warehouses, ingredients and units | Branch locations and opening stock implemented; broader warehouse workflows remain |
| 10 | Recipes and costing | Recipe CRUD and KOT stock deduction implemented; broader costing workflows remain |
| 11 | Suppliers, purchasing and receiving | Not started |
| 12 | Transfers, counts and waste | Not started |
| 13 | Floors, tables and QR menus | Table and dining-section operations implemented; QR menus remain |
| 14 | POS devices and cash sessions | Terminal setup and cash-session reconciliation implemented; hardware pairing remains |
| 15 | Orders and table service | Orders, KOTs, table lifecycle, and setup test orders implemented; broader service workflows remain |
| 16 | KOT, KDS and printing | Not started |
| 17 | Payments, refunds and receipts | Not started |
| 18 | Customers, reservations, requests and loyalty | Not started |
| 19 | Online ordering and delivery | Not started |
| 20 | Dashboards, finance, reports and production verification | Not started |

## Part 1 notes

Foundation work is in the existing `backend` and `admin-web` trees. Directory names were not renamed.

Verified on this machine:

- `npm test` in `backend`: 8 passed, 0 failed. Covers liveness, readiness failure, readiness success against local MongoDB, unknown routes, invalid JSON, production error bodies, and missing configuration.
- `npm run build` in `admin-web`: succeeded. Vite reported an existing large-bundle warning.
- `GET /api/v1/health` returned 200. `GET /api/v1/health/ready` returned 200 while `mongod` was listening on `127.0.0.1:27017`.
- Unknown routes return JSON `NOT_FOUND`. Invalid JSON returns `INVALID_INPUT`.
- The admin login screen shows **Connected** and **Retry**. Retry moves the status through Connecting and back to Connected.
- The Windows `MongoDB` service could not be started from this session. A user-level `mongod` process is using `D:\RMS\.mongo-data`.
- `desktop-pos` and `mobile-app` still have no start script.

Access isolation, login changes, and business CRUD were not part of this work.

## Part 2 notes

Sessions replace the previous JWT and `localStorage` token. Restaurant routes return HTTP 403 until branch authorization exists.

Verified:

- Backend `npm test`: environment, health, and session tests passed, using the isolated database `rms_part2_auth_test`.
- Admin `npm test`: redirect, shell gate, and network-failure behavior passed.
- Admin `npm run build` succeeded.

Login rate limiting uses an in-memory store for one API process.

## Part 3 notes

Company membership, system roles, and branch reads are enforced on the server. The admin shell waits for the access context before rendering pages. Menu, inventory, orders, and the other deferred modules still return HTTP 403.

Verified:

- Backend `npm test` passed, including `rms_part3_access_test`.
- Admin `npm test` passed for session and access-gate states.
- Admin `npm run build` succeeded. Vite’s existing large-bundle warning remains.

There is no lint script in the backend or admin packages. Socket.IO still rejects every connection; live branch rooms are Part 16.

## Part 4 notes

Branch drafts, configuration overrides, the setup checklist, and lifecycle actions are available. Activation stays blocked until later modules exist. The Branches page reads the branch API and no longer shows fabricated sales figures.

Verified after this part:

- Backend `npm test`: 37 passed, 0 failed. Includes `rms_part4_branch_test` and the earlier suites.
- Admin `npm test`: 5 passed, 0 failed.
- Admin `npm run build` succeeded. The built script is about 498 kB. This run did not print the previous large-bundle warning.

Menu, inventory, orders, kitchens, tables, and payments still return HTTP 403. The signed-in Branches page was not opened in a browser.
