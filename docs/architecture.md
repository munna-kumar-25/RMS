# Architecture contract

This document is the ownership and access model for later parts. Part 1 does not implement login changes, role checks, or branch isolation. Existing authentication routes and middleware are still in the codebase, and they are not this contract.

## Ownership

One restaurant company owns many branches. Five branches are initial data, not an application limit.

The company owns records that are shared across the business, such as the company profile, a central menu definition, and central inventory locations. Those records use `companyId`.

A branch owns operational records: local prices and availability, staff assignments, kitchens, branch stock locations, floors, tables, terminals, orders, and payments. Those records use both `companyId` and `branchId`.

A central warehouse or other company-level location is not an implicit branch. It has explicit company ownership. A branch location also stores `branchId`.

## Access

A company super admin can access every branch in their own company. They cannot access another company by choosing an id in the UI.

Branch staff can access only the branches assigned to them.

The backend is the authority for every read and write. A company id or branch id sent by the browser, a header, or a query parameter is not proof of authorization.

## All Branches

The admin “All Branches” selector is a consolidated read scope for reporting. It is valid for dashboards and reports that aggregate the branches the caller is allowed to see.

An operational write must name one branch. Creating an order, adjusting stock, opening a cash session, or printing a ticket cannot target “All Branches”.

## Part 1 status

Part 1 provides the API process, environment validation, the MongoDB connection module, health and readiness endpoints, and an admin connection indicator.

Part 1 does not enforce company ownership, branch assignment, or the “All Branches” write rule.

## Part 2 status

Part 2 identifies users and keeps server-side sessions. Login does not grant access to restaurant data.

## Part 3 status

Part 3 enforces company membership, role permissions, and branch scope. The session may store an active company id after the server validates it. Permissions are read from memberships and roles on each request. See `docs/access-control.md`.

## Part 4 status

Part 4 adds branch drafts, configuration inheritance, a server-built setup checklist, and lifecycle transitions. Branches remain unable to activate while later modules are missing. See `docs/branch-management.md`.
