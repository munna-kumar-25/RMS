# Branch management

Part 4 adds branch setup on top of Part 3 access control. A branch can be drafted and configured. Activation requires operational setup evidence across inventory, recipes, dining, POS, and a completed test order.

## Schema

The existing `Branch` collection is extended. The id stays the same when the name, address, or code changes.

Identity and location fields include `companyId`, `name`, `code`, `description`, address lines, `city`, `stateOrProvince`, `postalCode`, `countryCode`, and optional `latitude` and `longitude`. Contact fields are `phone` and `email`.

`setupStatus` is the lifecycle: `draft`, `ready_for_testing`, `active`, or `suspended`. `archivedAt` marks the terminal archived state. The older `status` field is only a visibility mirror: `inactive` when archived, otherwise `active`, so Part 3 queries keep working. `isActive` follows that mirror.

`revision` guards branch edits. `configurationRevision` guards overrides. `overrides` stores only values that differ from the company. Company defaults are not copied onto every branch.

## Ownership and permissions

`companyId` comes from the validated session company. A branch code is unique inside that company and may be reused by another company.

`branches.create` is company scope and creates a draft. `branches.update` edits an assigned branch. `branches.lifecycle` marks ready, activates, suspends, resumes, or archives. Branch managers receive update access in the default template and do not receive lifecycle access. The company super admin role includes both, only inside its own company.

Ordinary branch updates cannot change `companyId`, `createdBy`, lifecycle timestamps, setup evidence, or role assignments.

## Operating hours

Weekly hours name each weekday. A day is closed or has one or more intervals. An overnight interval sets `overnight: true` and ends the next morning, so the end time is earlier than the start time. A same-day interval must end after it starts. Overlaps are rejected, including an overnight interval that runs into the next day's first service. Date exceptions replace that date and use the same interval rules.

## Business date

`businessDayCutoff` is a local `HH:mm` in the branch timezone. A timestamp before the cutoff belongs to the previous local calendar date. A timestamp at or after the cutoff belongs to that local calendar date. The default cutoff is `04:00`.

## Configuration inheritance

Effective settings are company defaults, then explicit branch overrides. The response includes the value and the source, `company` or `branch`. Sending `null` for an override removes it and restores the company value.

Overridable keys are timezone, operating hours, business-day cutoff, phone, email, receipt name, order channels, reservations, and online ordering. `currencyCode` is the company reporting currency and cannot be overridden. There is no exchange-rate support. Unknown keys are rejected.

Branch configuration saves menu publication state and channels, kitchen stations/category routing, inventory defaults and controls, receipt paper/copy/footer settings, India GST/service charges, and exactly one accepted payment method. Order creation uses these settings; KOT preparation deducts recipe ingredients from branch stock.

## Setup checklist

The server computes readiness. A client cannot mark a technical check complete. Identity and address, weekly hours, and an active branch-manager assignment are required before a branch can be marked ready for testing. Activation additionally requires an active inventory location, posted opening counts, recipes for available menu items (except packaged-item branches), dining tables for dine-in, an active POS terminal, and a paid test order with a ready or served KOT.

These activation requirements are derived from persisted branch records. Opening stock is recorded against locations and inventory balances; recipe ingredients must belong to the same branch and are deducted when a KOT enters preparation; dine-in orders claim and release their table; POS sessions reconcile opening cash, completed cash payments, and closing variance. Dine-in channels require an active table. Packaged-item sales do not require recipes or kitchen stock deduction.

The admin branch workspace guides users through identity, weekly hours and timezone, branch configuration, and the setup checklist. Its location action uses browser geolocation and OpenStreetMap Nominatim reverse geocoding to fill the street, city, state, and postal code; the UI discloses that coordinates are sent to Nominatim. If reverse geocoding fails, GPS coordinates are still saved and the user receives a warning so the address can be entered manually. The same section creates ingredients and stock locations, reviews and posts opening counts, configures a POS terminal, opens/closes cash sessions, and runs the end-to-end test order. Recipe creation and floor/table management use their dedicated workspaces. Users with membership-management permission can assign an active company member the system branch-manager role from the branch access section.

The dashboard loads operational records for the selected branch, or aggregates authorized branches in the global view. Orders, kitchen tickets, inventory, menu items, recipes, tables, and expenses are permission-scoped by branch; the Today, 7 Days, and 30 Days controls filter period-based order and expense totals.

## Lifecycle

Draft branches are editable and cannot take live sales. Mark ready requires identity, hours, and manager checks. Ready for testing still cannot take live sales. Activate requires every activation check to be complete.

Suspend is allowed from ready or active and blocks new sales through `assertNewSalesAllowed`. Resume rechecks readiness and returns the branch to ready for testing when activation is still blocked. It does not jump an incomplete branch to active.

Archive sets `archivedAt`, keeps the id, and removes the branch from the normal selector and the open list. Authorized users can still read it with the archived filter. The response lists operational closure checks that are not yet enforced, including open orders, table sessions, POS sessions, and inventory reconciliation. Permanent deletion is not offered.

Lifecycle updates compare `revision` and `configurationRevision`. A stale or concurrent update returns HTTP 409.

Repeated creates send `Idempotency-Key`. The same key returns the original branch.

## API examples

Create:

```http
POST /api/v1/branches
Idempotency-Key: branch-01-setup
X-CSRF-Token: <token>

{ "name": "Branch 01", "code": "BR-01", "city": "Chennai", "countryCode": "IN" }
```

The branch is created as `draft`.

Update identity with the current revision:

```http
PATCH /api/v1/branches/<id>
{ "revision": 1, "addressLine1": "1 Service Road", "city": "Chennai", "countryCode": "IN" }
```

Set hours:

```http
PATCH /api/v1/branches/<id>/configuration
{
  "revision": 2,
  "configurationRevision": 0,
  "overrides": {
    "operatingHours": {
      "monday": { "closed": false, "intervals": [{ "start": "18:00", "end": "02:00", "overnight": true }] }
    }
  }
}
```

Other routes: `GET /branches`, `GET /branches/:id`, `GET /branches/:id/configuration`, `GET /branches/:id/setup`, `POST /branches/:id/setup/validate`, `GET /branches/:id/access`, `GET /branches/:id/history`, and the lifecycle actions `mark-ready`, `activate`, `suspend`, `resume`, and `archive`.

## Seed

```powershell
npm run seed:dev-branches --prefix backend
```

This runs only when invoked, and only outside production. It creates Branch 01 through Branch 05 as drafts with placeholder addresses. A repeat skips existing codes and does not overwrite edits. It does not activate branches or create staff logins.

## Branch operations available

The branch configuration screen supports menu publication, kitchen station/category routing, inventory policies, receipt settings, India GST/service charges, and one accepted payment method. These settings are persisted per branch and are used by the corresponding order, KOT, stock, receipt, and payment flows.

The setup checklist links identity, hours, manager assignment, supported module settings, and operational setup tools. Configurable modules appear as optional checks and do not prevent marking a branch ready for testing; activation requirements remain visible until the corresponding persisted workflow evidence exists.

Payment collection records manually confirmed cash, card-terminal, UPI, or other payments; it does not connect to a payment gateway or charge a card. POS terminal configuration stores terminal metadata and reconciles cash sessions, but does not pair hardware. Receipts use the browser print dialog; physical printer selection and availability remain under the browser/operating system.
