import React from 'react';
import {
  LayoutDashboard,
  Building2,
  Users,
  UtensilsCrossed,
  Boxes,
  ScrollText,
  ShoppingBag,
  Flame,
  LayoutGrid,
  Calculator,
  Receipt,
  Truck,
  BarChart3,
  Bell,
  ShieldCheck,
  Settings,
  ChevronRight,
  ChevronDown,
  FolderPlus,
  Plus,
  LogOut,
} from 'lucide-react';
import { useAppStore } from '../../store/AppStore.tsx';
import { useAccess } from '../../context/AccessContext.jsx';
import { holdsPermission, NAV_PERMISSIONS } from '../../auth/accessGate.js';
import { getMaterialStockStatus, getMenuItemStockStatus } from '../../utils/inventoryStatus.js';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  section: string;
  badge?: string | number;
  badgeVariant?: 'rose' | 'indigo' | 'amber';
}

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onOpenCreateRestaurant: () => void;
  onOpenCreateStaff: () => void;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
  isCollapsed?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPath,
  onNavigate,
  onOpenCreateRestaurant,
  onOpenCreateStaff,
  isMobileOpen,
  onMobileClose,
  isCollapsed = false,
}) => {
  const { kots, inventoryItems, menuItems, notifications, currentUser } = useAppStore();

  const pendingKotsCount = kots.filter((k) => k.status === 'PENDING' || k.status === 'PREPARING').length;
  const lowStockCount = inventoryItems.filter((item) => {
    const status = getMaterialStockStatus(item);
    return status === 'LOW_STOCK' || status === 'OUT_OF_STOCK';
  }).length + menuItems.filter((item) => {
    const status = getMenuItemStockStatus(item);
    return status === 'LOW_STOCK' || status === 'OUT_OF_STOCK';
  }).length;
  const unreadNotifCount = notifications.filter((n) => !n.isRead).length;
  const userInitials = currentUser.name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'AD';
  const access = useAccess();
  const branchLists = access.branches.map((branch) => branch.permissions);
  const [menuCatalogOpen, setMenuCatalogOpen] = React.useState(
    () => currentPath.startsWith('/admin/menu')
  );
  const [restaurantsOpen, setRestaurantsOpen] = React.useState(
    () => currentPath.startsWith('/admin/restaurants')
  );
  const [employeesOpen, setEmployeesOpen] = React.useState(
    () => currentPath.startsWith('/admin/employees') || currentPath.startsWith('/admin/designations')
  );
  React.useEffect(() => {
    if (currentPath.startsWith('/admin/menu')) setMenuCatalogOpen(true);
  }, [currentPath]);
  React.useEffect(() => {
    if (currentPath.startsWith('/admin/restaurants')) setRestaurantsOpen(true);
  }, [currentPath]);
  React.useEffect(() => {
    if (currentPath.startsWith('/admin/employees') || currentPath.startsWith('/admin/designations')) {
      setEmployeesOpen(true);
    }
  }, [currentPath]);

  const allNavItems: NavItem[] = [
    { id: 'dashboard', section: 'Overview', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" />, path: '/admin/dashboard' },
    { id: 'branches', section: 'Workspace', label: 'Branches', icon: <Building2 className="w-4 h-4" />, path: '/admin/branches' },
    { id: 'restaurants', section: 'Workspace', label: 'Restaurants', icon: <Building2 className="w-4 h-4" />, path: '/admin/restaurants' },
    { id: 'employees', section: 'Workspace', label: 'Employees & Roles', icon: <Users className="w-4 h-4" />, path: '/admin/employees' },
    { id: 'menu', section: 'Workspace', label: 'Menu Catalog', icon: <UtensilsCrossed className="w-4 h-4" />, path: '/admin/menu' },
    { id: 'inventory', section: 'Operations', label: 'Inventory Stock', icon: <Boxes className="w-4 h-4" />, path: '/admin/inventory', badge: lowStockCount > 0 ? lowStockCount : undefined, badgeVariant: 'rose' },
    { id: 'recipes', section: 'Operations', label: 'Recipes & Costing', icon: <ScrollText className="w-4 h-4" />, path: '/admin/recipes' },
    { id: 'orders', section: 'Operations', label: 'Orders & POS', icon: <ShoppingBag className="w-4 h-4" />, path: '/admin/orders' },
    { id: 'kitchen', section: 'Operations', label: 'Kitchen / KDS', icon: <Flame className="w-4 h-4" />, path: '/admin/kitchen', badge: pendingKotsCount > 0 ? pendingKotsCount : undefined, badgeVariant: 'amber' },
    { id: 'floor', section: 'Operations', label: 'Floor & Tables', icon: <LayoutGrid className="w-4 h-4" />, path: '/admin/floor' },
    { id: 'accounting', section: 'Finance', label: 'Accounting & P&L', icon: <Calculator className="w-4 h-4" />, path: '/admin/accounting' },
    { id: 'expenses', section: 'Finance', label: 'Expense Ledger', icon: <Receipt className="w-4 h-4" />, path: '/admin/expenses' },
    { id: 'suppliers', section: 'Finance', label: 'Suppliers & Vendors', icon: <Truck className="w-4 h-4" />, path: '/admin/suppliers' },
    { id: 'reports', section: 'Finance', label: 'Reports & Analytics', icon: <BarChart3 className="w-4 h-4" />, path: '/admin/reports' },
    { id: 'notifications', section: 'System', label: 'Notification Center', icon: <Bell className="w-4 h-4" />, path: '/admin/notifications', badge: unreadNotifCount > 0 ? unreadNotifCount : undefined, badgeVariant: 'indigo' },
    { id: 'audit-logs', section: 'System', label: 'System Audit Logs', icon: <ShieldCheck className="w-4 h-4" />, path: '/admin/audit-logs' },
    { id: 'settings', section: 'System', label: 'System Settings', icon: <Settings className="w-4 h-4" />, path: '/admin/settings' },
  ];

  const visibleNavItems = allNavItems.filter((item) => (
    (NAV_PERMISSIONS[item.id] || []).some((permission) => holdsPermission(access.companyPermissions, branchLists, permission))
  ));

  const handleItemClick = (path: string) => {
    onNavigate(path);
    if (onMobileClose) onMobileClose();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm md:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar aside */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 ${isCollapsed ? 'md:w-16' : 'md:w-64'} w-64 bg-slate-950 border-r border-slate-800 flex flex-col transition-[width,transform] duration-200 ease-in-out md:translate-x-0 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        {/* Brand Header */}
        <div className={`h-16 ${isCollapsed ? 'md:px-0 md:justify-center' : 'px-5'} border-b border-slate-800 flex items-center justify-between`}>
          <div className={`flex items-center ${isCollapsed ? 'md:justify-center' : 'gap-3'}`}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-400 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-950/50 font-black text-sm">
              RMS
            </div>
            <div className={isCollapsed ? 'md:hidden' : ''}>
              <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white block leading-none">
                RMS Admin
              </span>
              <span className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase">
                Operations console
              </span>
            </div>
          </div>
        </div>

        {/* Nav Items List */}
        <nav className={`flex-1 overflow-y-auto rms-scrollbar-hidden ${isCollapsed ? 'md:px-2' : 'px-3'} py-4 space-y-1`}>
          {visibleNavItems.map((item, index) => {
            const isActive = currentPath === item.path
              || currentPath.startsWith(`${item.path}/`)
              || (item.id === 'restaurants' && currentPath.startsWith('/admin/restaurants'));
            const isNewSection = index === 0 || visibleNavItems[index - 1].section !== item.section;

            return (
              <React.Fragment key={item.id}>
                {isNewSection && (
                  <div className={`px-3 ${index === 0 ? '' : 'pt-5'} pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 ${isCollapsed ? 'md:hidden' : ''}`}>
                    {item.section}
                  </div>
                )}
                {item.id === 'employees' ? (
                  <>
                    <button
                      type="button"
                      aria-expanded={employeesOpen}
                      onClick={() => {
                        setEmployeesOpen((open) => !open);
                        if (!currentPath.startsWith('/admin/employees') && !currentPath.startsWith('/admin/designations')) {
                          onNavigate('/admin/employees');
                        }
                      }}
                      title={isCollapsed ? item.label : undefined}
                      className={`group relative w-full flex items-center ${isCollapsed ? 'md:justify-center md:px-2' : 'justify-between px-3'} py-2.5 rounded-lg text-xs font-semibold transition-all ${isActive
                        ? 'bg-indigo-500/15 text-white ring-1 ring-inset ring-indigo-400/20'
                        : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'
                        }`}
                    >
                      {isActive && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full bg-cyan-300" />}
                      <div className={`flex items-center ${isCollapsed ? 'md:justify-center' : 'gap-3'} truncate`}>
                        <span className={isActive ? 'text-cyan-300' : 'text-slate-500 group-hover:text-slate-300'}>{item.icon}</span>
                        <span className={`truncate ${isCollapsed ? 'md:hidden' : ''}`}>{item.label}</span>
                      </div>
                      {!isCollapsed && <ChevronDown className={`h-3.5 w-3.5 transition-transform ${employeesOpen ? 'rotate-180' : ''}`} />}
                    </button>
                    {employeesOpen && !isCollapsed && (
                      <div className="ml-5 space-y-1 border-l border-slate-800 pl-3">
                        {access.can('staff.manage') && (
                          <button
                            type="button"
                            onClick={() => {
                              onOpenCreateStaff();
                              if (onMobileClose) onMobileClose();
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-semibold text-cyan-200 transition-colors hover:bg-white/[0.06]"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add Staff
                          </button>
                        )}
                        {access.can('staff.read') && (
                          <button
                            type="button"
                            onClick={() => handleItemClick('/admin/employees')}
                            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-semibold transition-colors ${currentPath.split('?')[0] === '/admin/employees' ? 'bg-indigo-500/10 text-cyan-200' : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'}`}
                          >
                            <Users className="h-3.5 w-3.5" />
                            Staff List
                          </button>
                        )}
                        {access.can('roles.manage') && (
                          <button
                            type="button"
                            onClick={() => handleItemClick(`/admin/designations?action=add&request=${Date.now()}`)}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-semibold text-cyan-200 transition-colors hover:bg-white/[0.06]"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add Designation
                          </button>
                        )}
                        {access.can('roles.read') && (
                          <button
                            type="button"
                            onClick={() => handleItemClick('/admin/designations')}
                            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-semibold transition-colors ${currentPath.split('?')[0] === '/admin/designations' && !currentPath.includes('action=add') ? 'bg-indigo-500/10 text-cyan-200' : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'}`}
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Designations
                          </button>
                        )}
                      </div>
                    )}
                  </>
                ) : item.id === 'restaurants' ? (
                  <>
                    <button
                      type="button"
                      aria-expanded={restaurantsOpen}
                      onClick={() => setRestaurantsOpen((open) => !open)}
                      title={isCollapsed ? item.label : undefined}
                      className={`group relative w-full flex items-center ${isCollapsed ? 'md:justify-center md:px-2' : 'justify-between px-3'} py-2.5 rounded-lg text-xs font-semibold transition-all ${isActive
                        ? 'bg-indigo-500/15 text-white ring-1 ring-inset ring-indigo-400/20'
                        : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'
                        }`}
                    >
                      {isActive && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full bg-cyan-300" />}
                      <div className={`flex items-center ${isCollapsed ? 'md:justify-center' : 'gap-3'} truncate`}>
                        <span className={isActive ? 'text-cyan-300' : 'text-slate-500 group-hover:text-slate-300'}>{item.icon}</span>
                        <span className={`truncate ${isCollapsed ? 'md:hidden' : ''}`}>{item.label}</span>
                      </div>
                      {!isCollapsed && <ChevronDown className={`h-3.5 w-3.5 transition-transform ${restaurantsOpen ? 'rotate-180' : ''}`} />}
                    </button>
                    {restaurantsOpen && !isCollapsed && (
                      <div className="ml-5 space-y-1 border-l border-slate-800 pl-3">
                        {access.can('branches.create') && (
                          <button
                            type="button"
                            onClick={() => {
                              onOpenCreateRestaurant();
                              if (onMobileClose) onMobileClose();
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-semibold text-cyan-200 transition-colors hover:bg-white/[0.06]"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add Restaurant
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleItemClick('/admin/restaurants')}
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-semibold transition-colors ${currentPath.split('?')[0] === '/admin/restaurants' ? 'bg-indigo-500/10 text-cyan-200' : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'}`}
                        >
                          <Building2 className="h-3.5 w-3.5 shrink-0" />
                          Manage Restaurants
                        </button>
                      </div>
                    )}
                  </>
                ) : item.id === 'menu' ? (
                  <>
                    <button
                      type="button"
                      aria-expanded={menuCatalogOpen}
                      onClick={() => setMenuCatalogOpen((open) => !open)}
                      title={isCollapsed ? item.label : undefined}
                      className={`group relative w-full flex items-center ${isCollapsed ? 'md:justify-center md:px-2' : 'justify-between px-3'} py-2.5 rounded-lg text-xs font-semibold transition-all ${isActive
                        ? 'bg-indigo-500/15 text-white ring-1 ring-inset ring-indigo-400/20'
                        : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'
                        }`}
                    >
                      {isActive && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full bg-cyan-300" />}
                      <div className={`flex items-center ${isCollapsed ? 'md:justify-center' : 'gap-3'} truncate`}>
                        <span className={isActive ? 'text-cyan-300' : 'text-slate-500 group-hover:text-slate-300'}>
                          {item.icon}
                        </span>
                        <span className={`truncate ${isCollapsed ? 'md:hidden' : ''}`}>{item.label}</span>
                      </div>
                      {!isCollapsed && <ChevronDown className={`h-3.5 w-3.5 transition-transform ${menuCatalogOpen ? 'rotate-180' : ''}`} />}
                    </button>
                    {menuCatalogOpen && !isCollapsed && (
                      <div className="ml-5 space-y-1 border-l border-slate-800 pl-3">
                        {access.can('menu.manage') && (
                          <button
                            type="button"
                            onClick={() => handleItemClick('/admin/menu/categories/new')}
                            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-semibold transition-colors ${currentPath === '/admin/menu/categories/new' ? 'bg-indigo-500/10 text-cyan-200' : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'}`}
                          >
                            <FolderPlus className="h-3.5 w-3.5" />
                            Add Category
                          </button>
                        )}
                        {access.can('menu.manage') && (
                          <button
                            type="button"
                            onClick={() => handleItemClick('/admin/menu')}
                            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-semibold transition-colors ${currentPath === '/admin/menu' ? 'bg-indigo-500/10 text-cyan-200' : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'}`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add Menu
                          </button>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleItemClick(item.path)}
                    title={isCollapsed ? item.label : undefined}
                    className={`group relative w-full flex items-center ${isCollapsed ? 'md:justify-center md:px-2' : 'justify-between px-3'} py-2.5 rounded-lg text-xs font-semibold transition-all ${isActive
                      ? 'bg-indigo-500/15 text-white ring-1 ring-inset ring-indigo-400/20'
                      : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'
                      }`}
                  >
                    {isActive && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full bg-cyan-300" />}
                    <div className={`flex items-center ${isCollapsed ? 'md:justify-center' : 'gap-3'} truncate`}>
                      <span className={isActive ? 'text-cyan-300' : 'text-slate-500 group-hover:text-slate-300'}>
                        {item.icon}
                      </span>
                      <span className={`truncate ${isCollapsed ? 'md:hidden' : ''}`}>{item.label}</span>
                    </div>

                    {item.badge !== undefined && (
                      <span className={`text-[10px] font-bold min-w-5 text-center px-1.5 py-0.5 rounded-full shrink-0 ${isCollapsed ? 'md:hidden' : ''} ${isActive ? 'bg-cyan-300/15 text-cyan-200' : 'bg-white/10 text-slate-300'}`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                )}
              </React.Fragment>
            );
          })}
        </nav>

        {/* Footer User Profile Pill */}
        <div className={`p-3 ${isCollapsed ? 'md:px-2' : ''} border-t border-slate-800 bg-slate-900`}>
          <div className="flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.06] transition-colors">
            <div className={`flex items-center ${isCollapsed ? 'md:justify-center' : 'gap-2.5'} truncate`}>
              <div className="w-8 h-8 rounded-full bg-cyan-300 text-slate-950 font-bold text-xs flex items-center justify-center shrink-0">
                {userInitials}
              </div>
              <div className={`truncate text-left ${isCollapsed ? 'md:hidden' : ''}`}>
                <span className="text-xs font-bold text-white block truncate leading-tight">
                  {currentUser.name}
                </span>
                <span className="text-[10px] text-slate-500 font-mono tracking-wider">
                  {currentUser.role}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('/admin/profile')}
              className={`text-slate-500 hover:text-slate-200 p-1 ${isCollapsed ? 'md:hidden' : ''}`}
              title="View Profile Settings"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
