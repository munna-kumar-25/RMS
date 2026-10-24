export const NAV_PERMISSIONS = {
  dashboard: ['dashboard.read'],
  branches: ['branches.read'],
  restaurants: ['branches.read'],
  'add-restaurant': ['branches.create'],
  employees: ['staff.read', 'staff.manage', 'roles.read', 'roles.manage', 'memberships.read'],
  designations: ['roles.read', 'roles.manage'],
  menu: ['menu.read'],
  inventory: ['inventory.read'],
  recipes: ['recipes.read'],
  orders: ['orders.read'],
  kitchen: ['kitchen.read'],
  floor: ['tables.read'],
  accounting: ['reports.read'],
  expenses: ['expenses.read'],
  suppliers: ['inventory.read'],
  reports: ['reports.read'],
  notifications: ['dashboard.read'],
  'audit-logs': ['audit.read'],
  settings: ['settings.read'],
};

const AGGREGATE_READS = [
  'dashboard.read',
  'branches.read',
  'reports.read',
  'orders.read',
  'inventory.read',
  'expenses.read',
  'staff.read',
  'menu.read',
  'kitchen.read',
  'tables.read',
];

export const holdsPermission = (companyPermissions = [], branchPermissionLists = [], permission) => {
  if (companyPermissions.includes(permission)) return true;
  return branchPermissionLists.some((list) => Array.isArray(list) && list.includes(permission));
};

export const routeAllowed = (path, companyPermissions = [], branchPermissionLists = []) => {
  const pathname = path.split('?')[0];
  if (pathname.startsWith('/admin/profile')) return true;
  const id = Object.keys(NAV_PERMISSIONS).find((key) => pathname === `/admin/${key}` || pathname.startsWith(`/admin/${key}/`));
  if (!id) return false;
  return NAV_PERMISSIONS[id].some((permission) => holdsPermission(companyPermissions, branchPermissionLists, permission));
};

export const allowAggregate = (companyPermissions = [], branchPermissionLists = []) => (
  AGGREGATE_READS.some((permission) => holdsPermission(companyPermissions, branchPermissionLists, permission))
);

export const accessViewState = ({ status, memberships = [], activeCompany = null, companyPermissions = [], branches = [] }) => {
  if (status === 'loading' || status === 'idle') return 'loading';
  if (status === 'error') return 'error';
  if (!memberships.length) return 'no-membership';
  const usable = memberships.filter((item) => item.status === 'active' && item.company?.status === 'active');
  if (!usable.length) {
    if (memberships.some((item) => item.status === 'disabled')) return 'membership-disabled';
    if (memberships.some((item) => item.company?.status === 'suspended')) return 'company-suspended';
    return 'no-membership';
  }
  if (!activeCompany && usable.length > 1) return 'choose-company';
  if (!companyPermissions.length && !branches.length) return 'no-access';
  return 'ready';
};
