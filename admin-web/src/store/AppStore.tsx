import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import {
  Branch,
  Employee,
  MenuItem,
  MenuCategory,
  InventoryItem,
  Recipe,
  Order,
  KOT,
  DiningTable,
  DiningSection,
  LedgerAccount,
  AccountingTransaction,
  Expense,
  Supplier,
  NotificationItem,
  AuditLogItem,
  Role,
  OrderStatus,
  KOTStatus,
  TableStatus,
} from '../types/index.ts';
import { useAuth } from '../hooks/useAuth.js';
import { useAccess } from '../context/AccessContext.jsx';
import api, { ensureCsrfToken } from '../services/api.js';
import { getMaterialStockStatus, getMenuItemStockStatus } from '../utils/inventoryStatus.js';

interface CurrentUser {
  name: string;
  email: string;
  role: Role;
  avatarUrl?: string;
}

interface AppStoreContextType {
  // Global Branch Selection
  activeBranchId: string | null; // null represents "All Branches (Global View)"
  activeBranch: Branch | null;
  setActiveBranchId: (id: string | null) => void;

  // App Theme & Drawers
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  isCommandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  isNotificationDrawerOpen: boolean;
  setNotificationDrawerOpen: (open: boolean) => void;

  // User session
  currentUser: CurrentUser;

  // Data Collections & Handlers
  branches: Branch[];
  dashboardDataStatus: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
  dashboardDataError: string;
  retryDashboardData: () => void;
  addBranch: (branch: Branch) => void;
  updateBranch: (id: string, updates: Partial<Branch>) => void;

  employees: Employee[];
  addEmployee: (employee: Employee) => void;
  updateEmployee: (id: string, updates: Partial<Employee>) => void;
  deleteEmployee: (id: string) => void;

  categories: MenuCategory[];
  setCategories: (categories: MenuCategory[]) => void;
  addCategory: (category: MenuCategory) => void;
  updateCategory: (id: string, updates: Partial<MenuCategory>) => void;
  deleteCategory: (id: string) => void;
  menuItems: MenuItem[];
  setMenuItems: React.Dispatch<React.SetStateAction<MenuItem[]>>;
  addMenuItem: (item: MenuItem) => void;
  updateMenuItem: (id: string, updates: Partial<MenuItem>) => void;
  deleteMenuItem: (id: string) => void;

  inventoryItems: InventoryItem[];
  setInventoryItems: (items: InventoryItem[]) => void;
  addStock: (id: string, quantity: number) => void;
  updateInventory: (id: string, updates: Partial<InventoryItem>) => void;

  recipes: Recipe[];
  addRecipe: (recipe: Recipe) => Promise<void>;
  updateRecipe: (id: string, updates: Partial<Recipe>) => Promise<void>;

  orders: Order[];
  setOrders: (orders: Order[]) => void;
  updateOrder: (id: string, updates: Partial<Order>) => void;
  updateOrderStatus: (id: string, status: OrderStatus) => void;

  kots: KOT[];
  setKots: (kots: KOT[]) => void;
  updateKOTStatus: (id: string, status: KOTStatus) => Promise<void>;

  tables: DiningTable[];
  sections: DiningSection[];
  addTable: (table: DiningTable) => void;
  updateTableStatus: (id: string, status: TableStatus) => void;

  ledgers: LedgerAccount[];
  transactions: AccountingTransaction[];
  expenses: Expense[];
  addExpense: (expense: Expense) => void;
  approveExpense: (id: string) => void;
  rejectExpense: (id: string) => void;

  suppliers: Supplier[];
  addSupplier: (supplier: Omit<Supplier, '_id' | 'totalPurchases' | 'outstandingBalance'>) => Promise<void>;

  notifications: NotificationItem[];
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;

  auditLogs: AuditLogItem[];
  addAuditLog: (log: Omit<AuditLogItem, '_id' | 'timestamp'>) => void;
}

const AppStoreContext = createContext<AppStoreContextType | null>(null);

export const AppStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const access = useAccess();
  // 1. Branch state
  const [activeBranchId, setActiveBranchIdState] = useState<string | null>(() => {
    return localStorage.getItem('rms_active_branch_id') || null;
  });

  // 2. UI Theme & Navigation Drawers
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('rms_theme') as 'light' | 'dark') || 'light';
  });
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [isNotificationDrawerOpen, setNotificationDrawerOpen] = useState(false);

  const currentUser = useMemo<CurrentUser>(() => user ? {
    name: user.name || '',
    email: user.email || '',
    role: user.role || '',
    avatarUrl: user.avatarUrl,
  } : { name: '', email: '', role: '' }, [user]);

  // 4. Data states
  const [branches, setBranches] = useState<Branch[]>([]);
  const [dashboardDataStatus, setDashboardDataStatus] = useState<AppStoreContextType['dashboardDataStatus']>('idle');
  const [dashboardDataError, setDashboardDataError] = useState('');
  const [dashboardRetry, setDashboardRetry] = useState(0);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [kots, setKots] = useState<KOT[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [sections, setSections] = useState<DiningSection[]>([]);
  const [ledgers, setLedgers] = useState<LedgerAccount[]>([]);
  const [transactions, setTransactions] = useState<AccountingTransaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated || access.status !== 'ready') {
      setCategories([]);
      setMenuItems([]);
      setInventoryItems([]);
      setEmployees([]);
      setRecipes([]);
      setTables([]);
      setSections([]);
      setOrders([]);
      setKots([]);
      setExpenses([]);
      setSuppliers([]);
      setLedgers([]);
      setTransactions([]);
      setNotifications([]);
      setBranches([]);
      setDashboardDataStatus('idle');
      setDashboardDataError('');
      return undefined;
    }
    const accessibleBranches = access.branches.filter((branch) => branch.setupStatus !== 'archived');
    setBranches(accessibleBranches.map((branch) => ({
      _id: branch.id,
      name: branch.name,
      code: branch.code,
      contact: { address: { city: branch.city || '' } },
      todayRevenue: 0,
      todayOrders: 0,
      isActive: true,
    } as Branch)));
    setCategories([]);
    setMenuItems([]);
    setInventoryItems([]);
    setEmployees([]);
    setRecipes([]);
    setTables([]);
    setSections([]);
    setOrders([]);
    setKots([]);
    setExpenses([]);
    setSuppliers([]);
    setLedgers([]);
    setTransactions([]);
    setNotifications([]);
    setDashboardDataError('');
    if (!accessibleBranches.length) {
      setDashboardDataStatus('empty');
      return undefined;
    }
    setDashboardDataStatus('loading');
    const loadBranchData = async () => {
      const failures: string[] = [];
      let successfulReads = 0;
      const branchData = await Promise.all(accessibleBranches.map(async (branch) => {
        const permissions = branch.permissions || [];
        const can = (permission: string) => access.isCompanySuperAdmin || permissions.includes(permission);
        const read = async <T,>(url: string, permission: string, params: Record<string, string | number> = {}): Promise<T | null> => {
          if (!can(permission)) return null;
          try {
            const response = await api.get(url, { params: { branchId: branch.id, limit: 100, ...params } });
            successfulReads += 1;
            return response.data?.data as T;
          } catch (error) {
            console.error(`[AppStore] Could not load ${url} for branch ${branch.id}:`, error);
            failures.push(`${branch.name}: ${error instanceof Error ? error.message : `Could not load ${url}.`}`);
            return null;
          }
        };
        const readAllOrders = async (): Promise<{ orders: any[] } | null> => {
          if (!can('orders.read')) return null;
          try {
            const firstPage = await api.get('/orders', {
              params: { branchId: branch.id, limit: 100, page: 1 },
            });
            const firstData = firstPage.data?.data;
            if (!Array.isArray(firstData?.orders)) throw new Error('Order response did not contain an orders list.');
            const allOrders = [...firstData.orders];
            const pages = Math.max(1, Number(firstData.pagination?.pages) || 1);
            for (let page = 2; page <= pages; page += 1) {
              const response = await api.get('/orders', {
                params: { branchId: branch.id, limit: 100, page },
              });
              const pageOrders = response.data?.data?.orders;
              if (!Array.isArray(pageOrders)) throw new Error(`Order response for page ${page} did not contain an orders list.`);
              allOrders.push(...pageOrders);
            }
            successfulReads += 1;
            return { orders: allOrders };
          } catch (error) {
            console.error(`[AppStore] Could not load recent orders for branch ${branch.id}:`, error);
            failures.push(`${branch.name}: ${error instanceof Error ? error.message : 'Could not load recent orders.'}`);
            return null;
          }
        };
        const readAllExpenses = async (): Promise<any[] | null> => {
          if (!can('expenses.read')) return null;
          try {
            const allExpenses: any[] = [];
            let pages = 1;
            for (let page = 1; page <= pages; page += 1) {
              const response = await api.get('/expenses', {
                params: { branchId: branch.id, limit: 100, page },
              });
              const expenseData = response.data?.data;
              if (!Array.isArray(expenseData?.expenses)) {
                throw new Error(`Expense response for page ${page} did not contain an expenses list.`);
              }
              allExpenses.push(...expenseData.expenses);
              pages = Math.max(1, Number(expenseData.pagination?.pages) || 1);
            }
            successfulReads += 1;
            return allExpenses;
          } catch (error) {
            console.error(`[AppStore] Could not load expenses for branch ${branch.id}:`, error);
            failures.push(`${branch.name}: ${error instanceof Error ? error.message : 'Could not load expenses.'}`);
            return null;
          }
        };
        const [categoryData, menuData, inventoryData, recipeData, tableData, orderData, kotData, expenseData, staffData, supplierData, accountingData] = await Promise.all([
          read<any[]>('/menu/categories', 'menu.read'),
          read<{ items: any[] }>('/menu/items', 'menu.read'),
          read<{ items: any[] }>('/inventory', 'inventory.read'),
          read<any[]>('/recipes', 'recipes.read'),
          read<any[]>('/tables', 'tables.read'),
          readAllOrders(),
          read<any[]>('/orders/kots', 'kitchen.read'),
          readAllExpenses(),
          read<{ staff: any[] }>('/staff', 'staff.read'),
          read<{ suppliers: Supplier[] }>('/accounting/suppliers', 'inventory.read'),
          read<{ ledgers: LedgerAccount[]; transactions: AccountingTransaction[] }>('/accounting/summary', 'reports.read'),
        ]);
        return { branch, categoryData, menuData, inventoryData, recipeData, tableData, orderData, kotData, expenseData, staffData, supplierData, accountingData };
      }));
      if (cancelled) return;
      const categoryRows: any[] = [];
      const menuRows: any[] = [];
      const inventoryRows: any[] = [];
      const recipeRows: Recipe[] = [];
      const tableRows: DiningTable[] = [];
      const orderRows: Order[] = [];
      const kotRows: KOT[] = [];
      const expenseRows: Expense[] = [];
      const employeeRows: Employee[] = [];
      const supplierRows: Supplier[] = [];
      const ledgerRows: LedgerAccount[] = [];
      const transactionRows: AccountingTransaction[] = [];
      const branchRevenue = new Map<string, { revenue: number; orders: number }>();

      for (const data of branchData) {
        const { branch } = data;
        employeeRows.push(...(data.staffData?.staff || []).map((staff) => ({
          _id: staff.id,
          employeeId: staff.employeeCode,
          name: staff.displayName,
          email: staff.email || '',
          phone: staff.phone || '',
          role: staff.role,
          roleId: staff.roleId || '',
          membershipId: staff.membershipId || '',
          revision: staff.revision,
          permissionModules: staff.permissionModules || [],
          branchId: branch.id,
          branchName: branch.name,
          permissions: [],
          status: staff.employmentStatus === 'active'
            ? 'ACTIVE'
            : staff.employmentStatus === 'on_leave' ? 'ON_LEAVE' : 'INACTIVE',
          joiningDate: staff.joiningDate || '',
        } as Employee)));
        supplierRows.push(...(data.supplierData?.suppliers || []).map((supplier) => ({
          ...supplier,
          _id: String(supplier._id),
          branchId: branch.id,
          totalPurchases: Number(supplier.totalPurchases) || 0,
          outstandingBalance: Number(supplier.outstandingBalance) || 0,
        })));
        ledgerRows.push(...(data.accountingData?.ledgers || []).map((ledger) => ({
          ...ledger,
          _id: String(ledger._id),
          branchId: branch.id,
        })));
        transactionRows.push(...(data.accountingData?.transactions || []).map((transaction) => ({
          ...transaction,
          _id: String(transaction._id),
          branchId: branch.id,
          branchName: branch.name,
        })));
        if (data.categoryData) categoryRows.push(...data.categoryData.map((category) => ({
          ...category,
          branchId: branch.id,
          branchName: branch.name,
          _id: String(category._id),
          itemCount: category.itemCount || 0,
          isActive: category.status !== 'INACTIVE',
        })));
        const branchMenu = data.menuData?.items || [];
        menuRows.push(...branchMenu.map((item) => ({
          ...item,
          _id: String(item._id),
          branchId: branch.id,
          branchName: branch.name,
          categoryId: String(item.categoryId?._id || item.categoryId),
          categoryName: item.categoryId?.name || item.categoryName || 'Uncategorised',
          branchAvailability: [branch.id],
          isAvailable: Boolean(item.availability),
          isAvailablePOS: Boolean(item.posAvailability),
          isAvailableOnline: Boolean(item.onlineAvailability),
          preparationTimeMinutes: item.preparationTime || 0,
          imageUrl: item.image || '',
          addons: item.addOns || [],
        })));
        const branchInventory = data.inventoryData?.items || [];
        inventoryRows.push(...branchInventory.map((item) => ({
          ...item,
          _id: String(item._id),
          branchId: branch.id,
          branchName: branch.name,
          unitCost: item.costPerUnit || 0,
        })));
        for (const recipe of data.recipeData || []) {
          const menuItem = branchMenu.find((item) => String(item._id) === String(recipe.menuItemId));
          const recipeIngredients = (recipe.ingredients || []).map((line: any) => {
            const inventoryItem = branchInventory.find((item) => String(item._id) === String(line.ingredientId));
            return {
              inventoryItemId: String(line.ingredientId),
              inventoryItemName: inventoryItem?.name || 'Inventory item',
              quantity: line.quantity,
              unit: line.unit,
              unitCost: line.costPerUnit,
              cost: line.totalCost ?? line.quantity * line.costPerUnit,
            };
          });
          recipeRows.push({
            _id: String(recipe._id),
            menuItemId: String(recipe.menuItemId),
            menuItemName: menuItem?.name || 'Menu item',
            categoryName: menuItem?.categoryId?.name || 'Uncategorised',
            ingredients: recipeIngredients,
            totalRecipeCost: recipe.totalCost,
            sellingPrice: recipe.sellingPrice,
            foodCostPercentage: recipe.foodCostPercentage,
            grossMarginPercentage: recipe.sellingPrice ? (recipe.grossMargin / recipe.sellingPrice) * 100 : 0,
            servingSize: '1 Portion',
          });
        }
        tableRows.push(...(data.tableData || []).map((table) => ({
          ...table,
          _id: String(table._id),
          branchId: branch.id,
          sectionId: `${branch.id}:${table.sectionName}`,
          activeOrderId: table.activeOrderId ? String(table.activeOrderId) : undefined,
        })) as DiningTable[]);
        const branchOrders = data.orderData?.orders || [];
        const todaysOrders = branchOrders.filter((order) => {
          const created = new Date(order.createdAt);
          const now = new Date();
          return created >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
        });
        branchRevenue.set(branch.id, {
          revenue: todaysOrders.reduce((sum, order) => sum + (order.status !== 'CANCELLED' ? Number(order.grandTotal) || 0 : 0), 0),
          orders: todaysOrders.length,
        });
        orderRows.push(...branchOrders.map((order) => ({
          ...order,
          _id: String(order._id),
          branchId: branch.id,
          branchName: branch.name,
          customerName: order.customerName || '',
          customerPhone: order.customerPhone || '',
        })) as Order[]);
        kotRows.push(...(data.kotData || []).map((kot) => ({
          ...kot,
          _id: String(kot._id),
          branchId: branch.id,
          orderNumber: kot.orderId?.orderNumber || '',
          tableNumber: '',
          elapsedMinutes: Math.max(0, Math.floor((Date.now() - new Date(kot.createdAt).getTime()) / 60000)),
          items: (kot.items || []).map((item: any) => ({ ...item, station: item.station || '' })),
        })) as KOT[]);
        expenseRows.push(...(data.expenseData || []).map((expense) => ({
          ...expense,
          _id: String(expense._id),
          branchId: branch.id,
          amount: Number(expense.amount) || 0,
        })) as Expense[]);
      }

      setBranches((current) => current.map((branch) => ({
        ...branch,
        todayRevenue: branchRevenue.get(branch._id)?.revenue || 0,
        todayOrders: branchRevenue.get(branch._id)?.orders || 0,
      })));
      setCategories(categoryRows as MenuCategory[]);
      setMenuItems(menuRows as MenuItem[]);
      setInventoryItems(inventoryRows as InventoryItem[]);
      setRecipes(recipeRows);
      setTables(tableRows);
      const sectionCounts = new Map<string, { branchId: string; name: string; count: number }>();
      tableRows.forEach((table) => {
        const name = table.sectionName || 'Main';
        const key = `${table.branchId}:${name}`;
        const section = sectionCounts.get(key) || { branchId: table.branchId, name, count: 0 };
        section.count += 1;
        sectionCounts.set(key, section);
      });
      setSections([...sectionCounts].map(([id, section]) => ({
        _id: id,
        branchId: section.branchId,
        name: section.name,
        totalTables: section.count,
      })));
      setOrders(orderRows);
      setKots(kotRows);
      setExpenses(expenseRows);
      setEmployees(employeeRows);
      setSuppliers(supplierRows);
      setLedgers(ledgerRows);
      setTransactions(transactionRows);
      const readKey = `rms_notification_read_${currentUser.email}`;
      let readNotificationIds: string[] = [];
      try {
        const saved = JSON.parse(localStorage.getItem(readKey) || '[]');
        if (Array.isArray(saved)) readNotificationIds = saved.filter((id) => typeof id === 'string');
      } catch (error) {
        console.warn('[AppStore] Saved notification read state could not be parsed.', error);
      }
      const generatedNotifications: NotificationItem[] = [
        ...inventoryRows.filter((item) => {
          const status = getMaterialStockStatus(item);
          return status === 'LOW_STOCK' || status === 'OUT_OF_STOCK';
        }).map((item) => ({
          _id: `inventory:${item._id}`,
          title: item.currentStock <= 0 ? 'Inventory out of stock' : 'Inventory running low',
          message: `${item.name} has ${item.currentStock} ${item.unit || 'units'} remaining.`,
          type: item.currentStock <= 0 ? 'ALERT' as const : 'WARNING' as const,
          category: 'INVENTORY' as const,
          branchId: item.branchId,
          branchName: item.branchName,
          isRead: readNotificationIds.includes(`inventory:${item._id}`),
          timestamp: item.updatedAt || new Date().toISOString(),
          actionUrl: '/admin/inventory',
        })),
        ...menuRows.filter((item) => {
          const status = getMenuItemStockStatus(item);
          return status === 'LOW_STOCK' || status === 'OUT_OF_STOCK';
        }).map((item) => ({
          _id: `menu-stock:${item._id}`,
          title: item.stockQuantity <= 0 ? 'Menu item out of stock' : 'Menu item running low',
          message: `${item.name} has ${item.stockQuantity} portions available.`,
          type: item.stockQuantity <= 0 ? 'ALERT' as const : 'WARNING' as const,
          category: 'INVENTORY' as const,
          branchId: item.branchId,
          branchName: item.branchName,
          isRead: readNotificationIds.includes(`menu-stock:${item._id}`),
          timestamp: item.updatedAt || new Date().toISOString(),
          actionUrl: '/admin/inventory',
        })),
        ...kotRows.filter((kot) => kot.status === 'PENDING' || kot.status === 'PREPARING').map((kot) => ({
          _id: `kot:${kot._id}`,
          title: 'Kitchen ticket needs attention',
          message: `Order ${kot.orderNumber || ''} is ${String(kot.status).toLowerCase()}.`,
          type: 'WARNING' as const,
          category: 'KOT' as const,
          branchId: kot.branchId,
          branchName: accessibleBranches.find((branch) => branch.id === kot.branchId)?.name,
          isRead: readNotificationIds.includes(`kot:${kot._id}`),
          timestamp: kot.createdAt || new Date().toISOString(),
          actionUrl: '/admin/kitchen',
        })),
        ...expenseRows.filter((expense) => expense.status === 'PENDING').map((expense) => ({
          _id: `expense:${expense._id}`,
          title: 'Expense approval pending',
          message: `${expense.title} is awaiting approval.`,
          type: 'INFO' as const,
          category: 'FINANCE' as const,
          branchId: expense.branchId,
          branchName: expense.branchName,
          isRead: readNotificationIds.includes(`expense:${expense._id}`),
          timestamp: expense.createdAt || new Date().toISOString(),
          actionUrl: '/admin/expenses',
        })),
      ];
      setNotifications(generatedNotifications);
      setDashboardDataStatus(successfulReads > 0 ? 'ready' : 'error');
      setDashboardDataError(failures.length
        ? failures.join(' ')
        : successfulReads > 0 ? '' : 'No dashboard-readable data is available for the accessible branches.');
    };
    loadBranchData();
    return () => { cancelled = true; };
  }, [isAuthenticated, access.status, access.branches, access.isCompanySuperAdmin, currentUser.email, dashboardRetry]);

  useEffect(() => {
    if (access.status !== 'ready' || !activeBranchId) return;
    const activeBranchIsAvailable = access.branches.some(
      (branch) => branch.id === activeBranchId && branch.setupStatus !== 'archived'
    );
    if (!activeBranchIsAvailable) {
      setActiveBranchIdState(null);
      localStorage.removeItem('rms_active_branch_id');
    }
  }, [access.status, access.branches, activeBranchId]);

  // Branch Selection handler
  const setActiveBranchId = useCallback((id: string | null) => {
    setActiveBranchIdState(id);
    if (id) {
      localStorage.setItem('rms_active_branch_id', id);
    } else {
      localStorage.removeItem('rms_active_branch_id');
    }
  }, []);

  const retryDashboardData = useCallback(() => {
    setDashboardRetry((current) => current + 1);
  }, []);

  const activeBranch = useMemo(() => {
    if (!activeBranchId) return null;
    return branches.find((b) => b._id === activeBranchId) || null;
  }, [activeBranchId, branches]);

  // Theme handler
  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem('rms_theme', next);
      if (next === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return next;
    });
  }, []);

  // CRUD handlers
  const addBranch = useCallback((newBranch: Branch) => {
    setBranches((prev) => [newBranch, ...prev]);
  }, []);

  const updateBranch = useCallback((id: string, updates: Partial<Branch>) => {
    setBranches((prev) =>
      prev.map((b) => (b._id === id ? { ...b, ...updates, updatedAt: new Date().toISOString() } : b))
    );
  }, []);

  const addEmployee = useCallback((employee: Employee) => {
    setEmployees((prev) => [employee, ...prev]);
  }, []);

  const updateEmployee = useCallback((id: string, updates: Partial<Employee>) => {
    setEmployees((prev) => prev.map((e) => (e._id === id ? { ...e, ...updates } : e)));
  }, []);

  const deleteEmployee = useCallback((id: string) => {
    setEmployees((prev) => prev.filter((e) => e._id !== id));
  }, []);

  const addMenuItem = useCallback((item: MenuItem) => {
    setMenuItems((prev) => [item, ...prev]);
  }, []);

  const addCategory = useCallback((category: MenuCategory) => {
    setCategories((previous) => [
      ...previous.filter((item) => item._id !== category._id),
      category,
    ]);
  }, []);

  const updateCategory = useCallback((id: string, updates: Partial<MenuCategory>) => {
    setCategories((previous) => previous.map((item) => (
      item._id === id ? { ...item, ...updates } : item
    )));
  }, []);

  const deleteCategory = useCallback((id: string) => {
    setCategories((previous) => previous.filter((item) => item._id !== id));
  }, []);

  const replaceCategories = useCallback((next: MenuCategory[]) => setCategories(next), []);
  const replaceMenuItems = useCallback((next: React.SetStateAction<MenuItem[]>) => setMenuItems(next), []);
  const replaceInventoryItems = useCallback((next: InventoryItem[]) => setInventoryItems(next), []);
  const replaceOrders = useCallback((next: Order[]) => setOrders(next), []);
  const replaceKots = useCallback((next: KOT[]) => setKots(next), []);

  const updateMenuItem = useCallback((id: string, updates: Partial<MenuItem>) => {
    setMenuItems((prev) => prev.map((item) => (item._id === id ? { ...item, ...updates } : item)));
  }, []);

  const deleteMenuItem = useCallback((id: string) => {
    setMenuItems((prev) => prev.filter((item) => item._id !== id));
  }, []);

  const addStock = useCallback((id: string, quantity: number) => {
    setInventoryItems((prev) =>
      prev.map((item) => {
        if (item._id === id) {
          const newQty = item.currentStock + quantity;
          return {
            ...item,
            currentStock: newQty,
            status: newQty > item.minimumStock ? 'IN_STOCK' : newQty > 0 ? 'LOW_STOCK' : 'OUT_OF_STOCK',
            updatedAt: new Date().toISOString(),
          };
        }
        return item;
      })
    );
  }, []);

  const updateInventory = useCallback((id: string, updates: Partial<InventoryItem>) => {
    setInventoryItems((prev) =>
      prev.map((item) => (item._id === id ? { ...item, ...updates, updatedAt: new Date().toISOString() } : item))
    );
  }, []);

  const saveRecipe = useCallback(async (recipe: Recipe, id?: string) => {
    if (!activeBranchId) throw new Error('Select a branch before saving a recipe.');
    await ensureCsrfToken();
    const payload = {
      branchId: activeBranchId,
      menuItemId: recipe.menuItemId,
      ingredients: recipe.ingredients.map((line) => ({
        ingredientId: line.inventoryItemId,
        quantity: line.quantity,
        unit: line.unit,
        costPerUnit: line.unitCost,
      })),
      sellingPrice: recipe.sellingPrice,
    };
    const response = id
      ? await api.put(`/recipes/${id}`, payload)
      : await api.post('/recipes', payload);
    const saved = response.data.data;
    const menuItem = menuItems.find((item) => item._id === String(saved.menuItemId));
    const normalized: Recipe = {
      ...recipe,
      _id: String(saved._id),
      menuItemId: String(saved.menuItemId),
      menuItemName: menuItem?.name || recipe.menuItemName,
      categoryName: menuItem?.categoryName || recipe.categoryName,
      totalRecipeCost: saved.totalCost,
      sellingPrice: saved.sellingPrice,
      foodCostPercentage: saved.foodCostPercentage,
      grossMarginPercentage: saved.sellingPrice ? (saved.grossMargin / saved.sellingPrice) * 100 : 0,
      ingredients: saved.ingredients.map((line: any) => {
        const item = inventoryItems.find((entry) => entry._id === String(line.ingredientId));
        return {
          inventoryItemId: String(line.ingredientId),
          inventoryItemName: item?.name || 'Inventory item',
          quantity: line.quantity,
          unit: line.unit,
          unitCost: line.costPerUnit,
          cost: line.totalCost,
        };
      }),
    };
    setRecipes((previous) => id
      ? previous.map((entry) => entry._id === id ? normalized : entry)
      : [normalized, ...previous]);
  }, [activeBranchId, inventoryItems, menuItems]);

  const addRecipe = useCallback((recipe: Recipe) => saveRecipe(recipe), [saveRecipe]);

  const updateRecipe = useCallback((id: string, updates: Partial<Recipe>) => {
    const current = recipes.find((recipe) => recipe._id === id);
    if (!current) throw new Error('Recipe not found.');
    return saveRecipe({ ...current, ...updates }, id);
  }, [recipes, saveRecipe]);

  const updateOrderStatus = useCallback((id: string, status: OrderStatus) => {
    setOrders((prev) => prev.map((o) => (o._id === id ? { ...o, status } : o)));
  }, []);
  const updateOrder = useCallback((id: string, updates: Partial<Order>) => {
    setOrders((prev) => prev.map((order) => order._id === id ? { ...order, ...updates } : order));
  }, []);

  const updateKOTStatus = useCallback(async (id: string, status: KOTStatus) => {
    await ensureCsrfToken();
    const response = await api.patch(`/orders/kots/${id}/status`, { status });
    const updated = response.data.data;
    setKots((prev) => prev.map((kot) => kot._id === id ? { ...kot, ...updated, _id: String(updated._id), branchId: String(updated.branchId) } : kot));
  }, []);

  const updateTableStatus = useCallback((id: string, status: TableStatus) => {
    setTables((prev) => prev.map((t) => (t._id === id ? { ...t, status } : t)));
  }, []);

  const addTable = useCallback((table: DiningTable) => {
    setTables((prev) => [table, ...prev]);
    setSections((prev) => {
      const existing = prev.find((section) => section._id === table.sectionId);
      if (existing) return prev.map((section) => section._id === table.sectionId ? { ...section, totalTables: section.totalTables + 1 } : section);
      return [...prev, { _id: table.sectionId, branchId: table.branchId, name: table.sectionName, totalTables: 1 }];
    });
  }, []);

  const addExpense = useCallback((expense: Expense) => {
    setExpenses((prev) => [expense, ...prev]);
  }, []);

  const approveExpense = useCallback((id: string) => {
    setExpenses((prev) =>
      prev.map((exp) => (exp._id === id ? { ...exp, status: 'APPROVED', approvedBy: currentUser.name } : exp))
    );
  }, [currentUser.name]);

  const rejectExpense = useCallback((id: string) => {
    setExpenses((prev) => prev.map((exp) => (exp._id === id ? { ...exp, status: 'REJECTED' } : exp)));
  }, []);

  const addSupplier = useCallback(async (supplier: Omit<Supplier, '_id' | 'totalPurchases' | 'outstandingBalance'>) => {
    if (!activeBranchId) throw new Error('Select a branch before adding a supplier.');
    await ensureCsrfToken();
    const response = await api.post('/accounting/suppliers', {
      ...supplier,
      branchId: activeBranchId,
    });
    const saved = response.data.data.supplier as Supplier;
    const normalized = {
      ...saved,
      _id: String(saved._id),
      branchId: activeBranchId,
      totalPurchases: 0,
      outstandingBalance: 0,
    };
    setSuppliers((prev) => [normalized, ...prev]);
  }, [activeBranchId]);

  const markNotificationAsRead = useCallback((id: string) => {
    const readKey = `rms_notification_read_${currentUser.email}`;
    const readIds = new Set<string>();
    try {
      const saved = JSON.parse(localStorage.getItem(readKey) || '[]');
      if (Array.isArray(saved)) saved.forEach((savedId) => {
        if (typeof savedId === 'string') readIds.add(savedId);
      });
    } catch (error) {
      console.warn('[AppStore] Saved notification read state could not be parsed.', error);
    }
    readIds.add(id);
    localStorage.setItem(readKey, JSON.stringify([...readIds]));
    setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
  }, [currentUser.email]);

  const markAllNotificationsAsRead = useCallback(() => {
    const readKey = `rms_notification_read_${currentUser.email}`;
    localStorage.setItem(readKey, JSON.stringify(notifications.map((notification) => notification._id)));
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, [currentUser.email, notifications]);

  const addAuditLog = useCallback(
    (log: Omit<AuditLogItem, '_id' | 'timestamp'>) => {
      const newLog: AuditLogItem = {
        ...log,
        _id: `aud_${Date.now()}`,
        timestamp: new Date().toISOString(),
      };
      setAuditLogs((prev) => [newLog, ...prev]);
    },
    []
  );

  const value = useMemo(
    () => ({
      activeBranchId,
      activeBranch,
      setActiveBranchId,
      theme,
      toggleTheme,
      isCommandPaletteOpen,
      setCommandPaletteOpen,
      isNotificationDrawerOpen,
      setNotificationDrawerOpen,
      currentUser,
      branches,
      dashboardDataStatus,
      dashboardDataError,
      retryDashboardData,
      addBranch,
      updateBranch,
      employees,
      addEmployee,
      updateEmployee,
      deleteEmployee,
      categories,
      setCategories: replaceCategories,
      addCategory,
      updateCategory,
      deleteCategory,
      menuItems,
      setMenuItems: replaceMenuItems,
      addMenuItem,
      updateMenuItem,
      deleteMenuItem,
      inventoryItems,
      setInventoryItems: replaceInventoryItems,
      addStock,
      updateInventory,
      recipes,
      addRecipe,
      updateRecipe,
      orders,
      setOrders: replaceOrders,
      updateOrder,
      updateOrderStatus,
      kots,
      setKots: replaceKots,
      updateKOTStatus,
      tables,
      sections,
      addTable,
      updateTableStatus,
      ledgers,
      transactions,
      expenses,
      addExpense,
      approveExpense,
      rejectExpense,
      suppliers,
      addSupplier,
      notifications,
      markNotificationAsRead,
      markAllNotificationsAsRead,
      auditLogs,
      addAuditLog,
    }),
    [
      activeBranchId,
      activeBranch,
      setActiveBranchId,
      theme,
      toggleTheme,
      isCommandPaletteOpen,
      isNotificationDrawerOpen,
      currentUser,
      branches,
      dashboardDataStatus,
      dashboardDataError,
      retryDashboardData,
      addBranch,
      updateBranch,
      employees,
      addEmployee,
      updateEmployee,
      deleteEmployee,
      categories,
      replaceCategories,
      addCategory,
      updateCategory,
      deleteCategory,
      menuItems,
      replaceMenuItems,
      addMenuItem,
      updateMenuItem,
      deleteMenuItem,
      inventoryItems,
      replaceInventoryItems,
      addStock,
      updateInventory,
      recipes,
      addRecipe,
      updateRecipe,
      orders,
      replaceOrders,
      updateOrderStatus,
      kots,
      replaceKots,
      updateKOTStatus,
      tables,
      sections,
      addTable,
      updateTableStatus,
      ledgers,
      transactions,
      expenses,
      addExpense,
      approveExpense,
      rejectExpense,
      suppliers,
      addSupplier,
      notifications,
      markNotificationAsRead,
      markAllNotificationsAsRead,
      auditLogs,
      addAuditLog,
    ]
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
};

export const useAppStore = () => {
  const context = useContext(AppStoreContext);
  if (!context) {
    throw new Error('useAppStore must be used within an AppStoreProvider');
  }
  return context;
};

export default useAppStore;
