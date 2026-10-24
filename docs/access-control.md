# Access control

Part 3 decides which company and branches an authenticated person may use. Part 2 still decides who the person is. A session cookie is not permission to read another company or another branch.

## Ownership

A company owns its branches, roles, and memberships.

| Record | Ownership |
| --- | --- |
| Company | The restaurant business. `code` is unique. `status` is `active` or `suspended`. |
| Branch | `companyId` plus a `code` that is unique inside that company. `status` is `active` or `inactive`. |
| Role | `companyId` plus a `key` that is unique inside that company. `scopeType` is `company` or `branch`. |
| Membership | One row per user per company. Company roles and branch assignments live here. |
| User | Identity only: name, email, password hash, and account status. |

Branch codes are unique per company, not globally. Older databases may still have a global unique index on `branches.code`. `npm run report:ownership --prefix backend` reports that index and any branch that has no `companyId`. It does not change data.

The existing branch contact, tax, and settings fields remain for Part 4. Part 3 does not add kitchens, warehouses, or onboarding.

## Membership and roles

- A user can belong to more than one company, with a different membership in each.
- Company roles apply to the company. Branch roles apply only on the branches listed in `branchAssignments`.
- A branch role cannot be stored as a company-wide role. A company role cannot be stored as a branch role.
- `authorizationVersion` on the membership increases when assignments change.
- `accessRevision` on the company increases when roles, memberships, or company settings change.

System role templates, created per company:

| Key | Scope | Default access |
| --- | --- | --- |
| `company_super_admin` | company | Every registered permission, and every branch in that company only. |
| `branch_manager` | branch | Broad operations on assigned branches. No membership or role administration. No inventory adjustment or payment refund. |
| `cashier` | branch | Orders and payment collection. No refunds. |
| `waiter` | branch | Tables and order creation. No payments. |
| `kitchen_staff` | branch | Kitchen tickets and status. Station limits can be added later without changing this role’s scope. |
| `warehouse_manager` | branch | Inventory read, receive, and transfer. No finance administration. |
| `accountant` | company | Reports and expenses across the company. No operational configuration. |
| `delivery_executive` | branch | Dashboard presence only. Delivery orders are a later module. |

System roles cannot be deleted, and their scope cannot be changed. The company super admin permission set cannot be reduced through the role API. Custom roles can be created by someone who already holds `roles.manage` and every permission they put on the role. A role that is still assigned cannot be deleted; the response names how many memberships must change first.

## Permission registry

Keys live in `backend/src/modules/access/permissions.js`. Unknown keys are rejected. Company-scoped keys are `company.read`, `company.update`, `branches.create`, `memberships.read`, `memberships.manage`, `roles.read`, `roles.manage`, `settings.read`, `settings.manage`, and `audit.read`. Every other registered key is branch-scoped.

Registering a key does not create a business endpoint. Menu, inventory, orders, kitchen, payments, and expenses routes still return HTTP 403.

## Scope rules

1. The active company is the membership stored on the server session after `POST /api/v1/access/company`, or the only active membership.
2. A `companyId` or `branchId` from the browser, query string, or body is not proof of access.
3. A branch is readable only when its `companyId` is the active company and the caller’s effective access includes it. Anyone else’s id returns HTTP 404.
4. HTTP 403 is used when the caller is inside an authorized company but the action is not allowed, such as a cashier editing roles.
5. Suspended companies and disabled memberships cannot perform business actions. A disabled membership is cleared from the session’s active company.
6. Company super admin access stops at that company.
7. Branch permissions apply only where the role is assigned, unless a company role deliberately includes those branch permissions. The accountant template is the company-scoped case.
8. Counts and lists use the same branch set as single-record reads.

Related records must share the active company and, for a branch operation, the same branch. `assertSameScope` rejects a Branch 01 order that points at a Branch 02 table. `assertOperationalBranch` rejects `all` and a missing branch for writes. Later transfer work must check both the source and the destination with that same rule.

The last active company super admin cannot be removed by disabling the membership, removing the role, or disabling the user identity. The company document stores `activeSuperAdminCount`. Removal uses `findOneAndUpdate` with `activeSuperAdminCount > 1` and an atomic decrement. That serializes concurrent removals on one document, including on a standalone MongoDB server. A plain count-then-update is not used. There is no platform-admin bypass.

## Global selector

“All Branches” is an aggregate read of the branches in the access context. It does not grant company administration. It is hidden when the caller has no aggregate read permission. Operational writes must name one branch. If a saved branch id is no longer accessible, the admin app clears it and selects another permitted branch, or shows that no branch is accessible.

Company settings and role management use the active company, not the branch selector.

## Middleware

`requireAuthentication` is the Part 2 session check.

Access routes then call `loadAccess`, which reads the current membership, roles, and branches. Permissions are not copied into the session. The session only remembers `activeCompanyId`.

`requireBranchPermission` and `resolveScopedResource` build queries that already include `companyId` and, when a single branch is required, `branchId`. Callers must not load a record by id and authorize it afterward.

## Endpoints

- `GET /api/v1/access/context`
- `POST /api/v1/access/company`
- `GET /api/v1/companies/current`
- `PATCH /api/v1/companies/current`
- `GET /api/v1/roles`
- `POST /api/v1/roles`
- `PATCH /api/v1/roles/:roleId`
- `DELETE /api/v1/roles/:roleId`
- `GET /api/v1/memberships`
- `POST /api/v1/memberships`
- `PATCH /api/v1/memberships/:membershipId`
- `GET /api/v1/branches`
- `GET /api/v1/branches/:branchId`

Mutations require the CSRF header. Membership responses include name, email, and status only. Branch creation and configuration are described in `docs/branch-management.md`.

## Revocation

The next protected request loads membership and role documents again. Disabling a membership, removing a branch assignment, or editing a role is visible immediately. Editing a role increments `accessRevision`, so every membership in that company picks up the new permissions on the next request. If the active membership is no longer valid, protected routes return HTTP 403 and the session company id is cleared. The person can select another valid company when one exists. Disabling the user identity still fails the Part 2 session check.

## Admin application

After `GET /auth/me` succeeds, the shell waits for `GET /access/context`. It does not render pages during that load. The screen distinguishes:

- not authenticated
- access context failed, with Retry
- no company membership
- membership disabled
- company suspended
- no accessible branches
- permission denied for a route

The branch selector lists only branches from that response. The sidebar, route guard, branch-creation button, and staff button follow the same permission keys. Roles and Access assignments are tabs on Employees & Roles. Staff attendance is not part of this screen.

## Bootstrap

These commands do nothing at server startup.

```powershell
npm run bootstrap:admin --prefix backend
npm run bootstrap:company --prefix backend
```

`bootstrap:company` asks for an existing administrator email, a company name, and a company code. It creates the company if the code is new, ensures system roles, and creates one super admin membership. A second run does not duplicate roles or memberships and does not change an existing membership.

Local placeholder branches, refused when `NODE_ENV` is `production`:

```powershell
npm run seed:dev-branches --prefix backend
```

That creates Branch 01 through Branch 05 with codes `BR-01` to `BR-05` when they are missing. It does not run automatically.

## Migration

```powershell
npm run report:ownership --prefix backend
```

The report counts branches with and without `companyId` and prints a sample of unowned branches. It refuses `--apply`. Do not attach unknown rows to a default branch. After a verified mapping, back up the database, set `companyId` only for those known rows, drop a leftover global unique index on `branches.code` if the report names one, and compare counts again.

## Live events

Socket.IO is still initialized, and every connection is rejected. Part 16 should authenticate the existing session cookie, allow only company and branch rooms the caller can access, ignore arbitrary room names, and disconnect clients whose membership or permissions were revoked. Part 3 does not add a partial real-time layer.

## Tests

`backend/src/modules/access/access.test.js` uses `rms_part3_access_test` and covers company isolation, branch tampering, aggregate reads, write rejection, unknown permissions, cross-company roles, deletion locks, concurrent super admin removal, immediate revocation, and audit redaction.

Admin route and empty-state rules are in `admin-web/src/auth/accessGate.test.js`.

## Part 4

Branch onboarding still needs create and update endpoints, contact and tax validation, and the admin wizard saving to those endpoints. Part 3 only lists branches the caller can already access. Kitchens, warehouses, menus, tables, and staff profiles stay in later parts.
