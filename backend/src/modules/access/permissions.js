/**
 * Central permission registry.
 * scope "company" applies to the company record and its administration.
 * scope "branch" applies only inside an authorized branch, unless a company role
 * deliberately grants that branch permission across the company.
 */

export const PERMISSIONS = {
  'company.read': { scope: 'company', description: 'View the active company profile.' },
  'company.update': { scope: 'company', description: 'Update the active company profile and status.' },
  'branches.read': { scope: 'branch', description: 'View branches the caller is allowed to access.' },
  'branches.create': { scope: 'company', description: 'Create a branch in the active company. Onboarding is a later part.' },
  'branches.update': { scope: 'branch', description: 'Update an authorized branch profile and permitted settings.' },
  'branches.lifecycle': { scope: 'branch', description: 'Move an authorized branch through ready, active, suspended, and archived.' },
  'memberships.read': { scope: 'company', description: 'View company memberships and branch assignments.' },
  'memberships.manage': { scope: 'company', description: 'Create and update memberships and branch assignments.' },
  'roles.read': { scope: 'company', description: 'View role definitions for the active company.' },
  'roles.manage': { scope: 'company', description: 'Create and update custom roles within the caller’s own permissions.' },
  'dashboard.read': { scope: 'branch', description: 'View dashboard summaries for authorized branches.' },
  'staff.read': { scope: 'branch', description: 'View staff records for authorized branches.' },
  'staff.manage': { scope: 'branch', description: 'Manage branch assignments for staff in authorized branches.' },
  'staff.employment.manage': { scope: 'company', description: 'Create staff profiles and edit company-wide employment fields.' },
  'staff.private.read': { scope: 'branch', description: 'View emergency contact and other private staff fields.' },
  'shifts.read': { scope: 'branch', description: 'View shift templates and schedules for authorized branches.' },
  'shifts.manage': { scope: 'branch', description: 'Create and publish shifts for authorized branches.' },
  'attendance.read': { scope: 'branch', description: 'View attendance for authorized branches.' },
  'attendance.clock': { scope: 'branch', description: 'Record attendance for another employee in an authorized branch.' },
  'attendance.correct': { scope: 'branch', description: 'Request an attendance correction in an authorized branch.' },
  'attendance.approve': { scope: 'branch', description: 'Approve attendance and correction requests in an authorized branch.' },
  'attendance.export': { scope: 'branch', description: 'Export attendance for authorized branches.' },
  'shifts.read.self': { scope: 'branch', description: 'View the signed-in employee’s own shifts.' },
  'attendance.read.self': { scope: 'branch', description: 'View the signed-in employee’s own attendance.' },
  'attendance.clock.self': { scope: 'branch', description: 'Clock the signed-in employee in and out.' },
  'menu.read': { scope: 'branch', description: 'View menu records for authorized branches.' },
  'menu.manage': { scope: 'branch', description: 'Manage menu records for authorized branches.' },
  'inventory.read': { scope: 'branch', description: 'View inventory for authorized branches.' },
  'inventory.receive': { scope: 'branch', description: 'Receive inventory at an authorized branch.' },
  'inventory.transfer': { scope: 'branch', description: 'Transfer inventory when both locations are authorized.' },
  'inventory.adjust': { scope: 'branch', description: 'Adjust inventory at an authorized branch.' },
  'recipes.read': { scope: 'branch', description: 'View recipes for authorized branches.' },
  'recipes.manage': { scope: 'branch', description: 'Manage recipes for authorized branches.' },
  'orders.read': { scope: 'branch', description: 'View orders for authorized branches.' },
  'orders.create': { scope: 'branch', description: 'Create orders at one authorized branch.' },
  'orders.update': { scope: 'branch', description: 'Update orders at one authorized branch.' },
  'orders.cancel': { scope: 'branch', description: 'Cancel orders at one authorized branch.' },
  'kitchen.read': { scope: 'branch', description: 'View kitchen tickets for authorized branches.' },
  'kitchen.update': { scope: 'branch', description: 'Update kitchen ticket status for authorized branches.' },
  'tables.read': { scope: 'branch', description: 'View tables for authorized branches.' },
  'tables.update': { scope: 'branch', description: 'Update table occupancy for authorized branches.' },
  'tables.manage': { scope: 'branch', description: 'Manage tables for authorized branches.' },
  'payments.collect': { scope: 'branch', description: 'Collect payments at one authorized branch.' },
  'payments.refund': { scope: 'branch', description: 'Refund payments at one authorized branch.' },
  'pos.read': { scope: 'branch', description: 'View POS terminals and cash sessions for authorized branches.' },
  'pos.manage': { scope: 'branch', description: 'Configure POS terminals for authorized branches.' },
  'pos.session.manage': { scope: 'branch', description: 'Open and close cash sessions for authorized branches.' },
  'reports.read': { scope: 'branch', description: 'View reports for authorized branches.' },
  'expenses.read': { scope: 'branch', description: 'View expenses for authorized branches.' },
  'expenses.manage': { scope: 'branch', description: 'Manage expenses for authorized branches.' },
  'settings.read': { scope: 'company', description: 'View company settings.' },
  'settings.manage': { scope: 'company', description: 'Manage company settings.' },
  'audit.read': { scope: 'company', description: 'View access audit records for the active company.' },
};

export const permissionKeys = () => Object.keys(PERMISSIONS);

export const isKnownPermission = (key) => Object.prototype.hasOwnProperty.call(PERMISSIONS, key);

export const permissionScope = (key) => PERMISSIONS[key]?.scope || null;

export const permissionsForScope = (scopeType) => permissionKeys().filter((key) => {
  if (scopeType === 'company') return true;
  return permissionScope(key) === 'branch';
});
