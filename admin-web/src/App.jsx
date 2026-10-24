import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppStoreProvider, useAppStore } from './store/AppStore.tsx';
import AdminLayout from './components/layout/AdminLayout.tsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { AccessProvider, useAccess } from './context/AccessContext.jsx';
import { BranchProvider } from './context/BranchContext.jsx';
import { useAuth } from './hooks/useAuth.js';
import LoginPage from './components/auth/LoginPage.jsx';
import BranchLoginPage from './components/auth/BranchLoginPage.jsx';
import { rememberIntendedPath } from './auth/sessionGate.js';
import { routeAllowed } from './auth/accessGate.js';

// Modals
import EmployeeModal from './components/modules/EmployeeModal.tsx';
import AddRestaurantModal from './components/modules/AddRestaurantModal.tsx';
import MenuItemModal from './components/modules/MenuItemModal.tsx';
import RecipeBuilderModal from './components/modules/RecipeBuilderModal.tsx';
import OrderDetailsDrawer from './components/modules/OrderDetailsDrawer.tsx';
import AddExpenseModal from './components/modules/AddExpenseModal.tsx';

// 18 Enterprise Module Pages
import DashboardPage from './pages/admin/DashboardPage.tsx';
import BranchesPage from './pages/admin/BranchesPage.jsx';
import RestaurantsPage from './pages/admin/RestaurantsPage.tsx';
import BranchWorkspace from './pages/admin/BranchWorkspace.jsx';
import EmployeesPage from './pages/admin/EmployeesPage.tsx';
import DesignationsPage from './pages/admin/DesignationsPage.tsx';
import MenuPage from './pages/admin/MenuPage.tsx';
import CreateMenuCategoryPage from './pages/admin/CreateMenuCategoryPage.tsx';
import InventoryPage from './pages/admin/InventoryPage.tsx';
import RecipesPage from './pages/admin/RecipesPage.tsx';
import OrdersPage from './pages/admin/OrdersPage.tsx';
import KitchenKdsPage from './pages/admin/KitchenKdsPage.tsx';
import FloorPlannerPage from './pages/admin/FloorPlannerPage.tsx';
import AccountingPage from './pages/admin/AccountingPage.tsx';
import ExpensesPage from './pages/admin/ExpensesPage.tsx';
import SuppliersPage from './pages/admin/SuppliersPage.tsx';
import ReportsPage from './pages/admin/ReportsPage.tsx';
import NotificationsPage from './pages/admin/NotificationsPage.tsx';
import AuditLogsPage from './pages/admin/AuditLogsPage.tsx';
import SettingsPage from './pages/admin/SettingsPage.tsx';
import ProfilePage from './pages/admin/ProfilePage.tsx';

const AppContent = () => {
  const { theme, setActiveBranchId } = useAppStore();
  const access = useAccess();

  // Client-side routing engine with browser history sync
  const [currentPath, setCurrentPath] = useState(() => {
    const path = `${window.location.pathname}${window.location.search}`;
    return path && path !== '/' && path !== '/admin' ? path : '/admin/dashboard';
  });

  // Modal & Drawer States
  const [employeeModal, setEmployeeModal] = useState({ isOpen: false, employee: null });
  const [isAddRestaurantOpen, setAddRestaurantOpen] = useState(false);
  const [menuItemModal, setMenuItemModal] = useState({ isOpen: false, item: null });
  const [recipeModal, setRecipeModal] = useState({ isOpen: false, recipe: null });
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isAddExpenseOpen, setAddExpenseOpen] = useState(false);

  // Sync dark class on document element
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const path = `${window.location.pathname}${window.location.search}`;
      setCurrentPath(path && path !== '/' && path !== '/admin' ? path : '/admin/dashboard');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((path, replace = false) => {
    if (path === currentPath) return;
    if (replace) {
      window.history.replaceState(null, '', path);
    } else {
      window.history.pushState(null, '', path);
    }
    setCurrentPath(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPath]);

  // Resolve Page based on currentPath
  const renderCurrentPage = () => {
    const pathname = currentPath.split('?')[0];
    const lists = access.branches.map((branch) => branch.permissions);
    if (!routeAllowed(currentPath, access.companyPermissions, lists)) {
      return (
        <div data-access-state="denied" className="p-8 text-sm text-slate-600 dark:text-slate-300">
          You do not have permission to open this page.
        </div>
      );
    }
    // 1. Check for single branch deep dive: /admin/branches/:branchId
    if (pathname.startsWith('/admin/branches/') && pathname !== '/admin/branches') {
      const branchId = pathname.slice('/admin/branches/'.length);
      const initialTab = new URLSearchParams(currentPath.split('?')[1] || '').get('tab') || 'overview';
      return (
        <BranchWorkspace
          key={`${branchId}:${initialTab}`}
          branchId={branchId}
          initialTab={initialTab}
          onBack={() => navigate('/admin/branches')}
          onNavigate={navigate}
        />
      );
    }

    switch (pathname) {
      case '/admin/dashboard':
      case '/admin':
      case '/':
        return (
          <DashboardPage
            onNavigate={navigate}
            onSelectOrder={(order) => setSelectedOrder(order)}
          />
        );

      case '/admin/branches':
        return (
          <BranchesPage
            onNavigate={navigate}
          />
        );

      case '/admin/restaurants':
        return <RestaurantsPage />;

      case '/admin/employees':
        return (
          <EmployeesPage
            onOpenEmployeeModal={(emp) =>
              setEmployeeModal({ isOpen: true, employee: emp || null })
            }
          />
        );

      case '/admin/designations':
        return (
          <DesignationsPage
            openCreateRequestKey={new URLSearchParams(currentPath.split('?')[1] || '').get('action') === 'add'
              ? new URLSearchParams(currentPath.split('?')[1] || '').get('request') || 'add'
              : ''}
          />
        );

      case '/admin/menu/categories/new':
        return <CreateMenuCategoryPage onNavigate={navigate} />;

      case '/admin/menu':
        return (
          <MenuPage
            onOpenMenuItemModal={(item) =>
              setMenuItemModal({ isOpen: true, item: item || null })
            }
          />
        );

      case '/admin/inventory':
        return <InventoryPage />;

      case '/admin/recipes':
        return (
          <RecipesPage
            onOpenRecipeBuilder={(recipe) =>
              setRecipeModal({ isOpen: true, recipe: recipe || null })
            }
          />
        );

      case '/admin/orders':
        return (
          <OrdersPage
            onSelectOrder={(order) => setSelectedOrder(order)}
          />
        );

      case '/admin/kitchen':
        return <KitchenKdsPage />;

      case '/admin/floor':
        return <FloorPlannerPage />;

      case '/admin/accounting':
        return <AccountingPage />;

      case '/admin/expenses':
        return (
          <ExpensesPage
            onOpenAddExpenseModal={() => setAddExpenseOpen(true)}
          />
        );

      case '/admin/suppliers':
        return <SuppliersPage />;

      case '/admin/reports':
        return <ReportsPage />;

      case '/admin/notifications':
        return <NotificationsPage onNavigate={navigate} />;

      case '/admin/audit-logs':
        return <AuditLogsPage />;

      case '/admin/settings':
        return <SettingsPage />;

      case '/admin/profile':
        return <ProfilePage />;

      default:
        return (
          <DashboardPage
            onNavigate={navigate}
            onSelectOrder={(order) => setSelectedOrder(order)}
          />
        );
    }
  };

  return (
    <AdminLayout
      currentPath={currentPath}
      onNavigate={navigate}
      onOpenCreateRestaurant={() => setAddRestaurantOpen(true)}
      onOpenCreateStaff={() => setEmployeeModal({ isOpen: true, employee: null })}
    >
      {/* Active Page View */}
      {renderCurrentPage()}

      <AddRestaurantModal
        isOpen={isAddRestaurantOpen}
        onClose={() => setAddRestaurantOpen(false)}
        onCreated={() => {
          setAddRestaurantOpen(false);
          window.dispatchEvent(new Event('restaurants:refresh'));
          navigate('/admin/restaurants');
        }}
      />

      {/* Employee Modal with RBAC Matrix */}
      <EmployeeModal
        isOpen={employeeModal.isOpen}
        onClose={() => setEmployeeModal({ isOpen: false, employee: null })}
        employeeToEdit={employeeModal.employee}
      />

      {/* 3. Menu Item Modal */}
      <MenuItemModal
        isOpen={menuItemModal.isOpen}
        onClose={() => setMenuItemModal({ isOpen: false, item: null })}
        itemToEdit={menuItemModal.item}
      />

      {/* 4. Recipe Builder Modal */}
      <RecipeBuilderModal
        isOpen={recipeModal.isOpen}
        onClose={() => setRecipeModal({ isOpen: false, recipe: null })}
        recipeToEdit={recipeModal.recipe}
      />

      {/* 5. Order Details Drawer */}
      <OrderDetailsDrawer
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        order={selectedOrder}
      />

      {/* 6. Add Expense Modal */}
      <AddExpenseModal
        isOpen={isAddExpenseOpen}
        onClose={() => setAddExpenseOpen(false)}
      />
    </AdminLayout>
  );
};

const SessionGate = () => {
  const {
    status,
    retry,
    user,
    logout,
    branchSelectionRequired,
    completeBranchSelection,
  } = useAuth();
  const access = useAccess();
  const { activeBranchId, setActiveBranchId } = useAppStore();
  const [selectedBranchId, setSelectedBranchId] = useState(activeBranchId || '');
  const branchSelectionReset = useRef(false);

  useEffect(() => {
    if (status !== 'authenticated' || access.status !== 'ready' || !branchSelectionRequired) {
      branchSelectionReset.current = false;
      return;
    }
    if (branchSelectionReset.current) return;
    branchSelectionReset.current = true;
    setSelectedBranchId('');
    setActiveBranchId(null);
  }, [status, access.status, branchSelectionRequired, setActiveBranchId]);

  useEffect(() => {
    if (status !== 'authenticated' || access.status !== 'ready' || !branchSelectionRequired || access.isCompanySuperAdmin) return;
    const branches = access.branches.filter((branch) => branch.setupStatus !== 'archived');
    if (branches.length === 1) {
      setActiveBranchId(branches[0].id);
      completeBranchSelection();
    }
  }, [status, access.status, access.branches, access.isCompanySuperAdmin, branchSelectionRequired, setActiveBranchId, completeBranchSelection]);

  const signOut = async () => {
    await logout();
    setActiveBranchId(null);
    setSelectedBranchId('');
  };

  if (status === 'initializing') {
    return (
      <main data-auth-state="initializing" className="min-h-screen grid place-items-center text-sm text-slate-500">
        Checking session
      </main>
    );
  }

  if (status === 'unavailable') {
    return (
      <main data-auth-state="unavailable" className="min-h-screen grid place-items-center gap-3 text-sm text-slate-600">
        <p>Session verification is unavailable.</p>
        <button type="button" onClick={retry} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white">Retry</button>
      </main>
    );
  }

  if (status !== 'authenticated') {
    rememberIntendedPath(window.location.pathname);
    return <LoginPage />;
  }

  if (access.view === 'loading') {
    return (
      <main data-access-state="loading" className="min-h-screen grid place-items-center text-sm text-slate-500">
        Checking access
      </main>
    );
  }

  if (access.view === 'error') {
    return (
      <main data-access-state="error" className="min-h-screen grid place-items-center gap-3 text-sm text-slate-600">
        <p>Access context could not be loaded.</p>
        <button type="button" onClick={() => access.refresh()} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white">Retry</button>
      </main>
    );
  }

  if (access.view === 'no-membership' || access.view === 'membership-disabled' || access.view === 'company-suspended' || access.view === 'no-access') {
    const messages = {
      'no-membership': {
        title: 'No branch access is assigned',
        detail: 'Ask your company administrator to add your account to a company and assign you to a branch, then sign in again.',
      },
      'membership-disabled': {
        title: 'Your company access is disabled',
        detail: 'Ask your company administrator to reactivate your membership.',
      },
      'company-suspended': {
        title: 'This company is suspended',
        detail: 'Contact your company administrator for help restoring access.',
      },
      'no-access': {
        title: 'No accessible branches',
        detail: 'Ask your company administrator to assign your account to at least one branch.',
      },
    }[access.view];
    return (
      <main data-access-state={access.view} className="grid min-h-screen place-items-center bg-slate-50 p-4 dark:bg-slate-950">
        <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-xl font-black text-slate-900 dark:text-white">{messages.title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{messages.detail}</p>
          <button type="button" onClick={() => signOut()} className="mt-6 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">
            Sign out
          </button>
        </section>
      </main>
    );
  }

  if (access.view === 'choose-company') {
    const choices = access.memberships.filter((item) => item.status === 'active' && item.company.status === 'active');
    return (
      <main data-access-state="choose-company" className="min-h-screen grid place-items-center gap-3 text-sm text-slate-700">
        <p>Select a company</p>
        {choices.map((item) => (
          <button
            key={item.company.id}
            type="button"
            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white"
            onClick={() => access.selectCompany(item.company.id)}
          >
            {item.company.name}
          </button>
        ))}
      </main>
    );
  }

  const selectableBranches = access.branches.filter((branch) => branch.setupStatus !== 'archived');
  if (branchSelectionRequired && !access.isCompanySuperAdmin && selectableBranches.length > 1) {
    const validSelection = selectableBranches.some((branch) => branch.id === selectedBranchId);
    return (
      <BranchLoginPage
        branches={selectableBranches}
        selectedBranchId={validSelection ? selectedBranchId : ''}
        onSelectBranch={setSelectedBranchId}
        onContinue={() => {
          if (!validSelection) return;
          setActiveBranchId(selectedBranchId);
          completeBranchSelection();
          window.history.replaceState(null, '', '/admin/dashboard');
        }}
        onLogout={signOut}
        user={user}
      />
    );
  }

  return (
    <div data-admin-shell="true">
      <AppContent />
    </div>
  );
};

export const App = () => {
  return (
    <AuthProvider>
      <AccessProvider>
        <BranchProvider>
          <AppStoreProvider>
            <SessionGate />
          </AppStoreProvider>
        </BranchProvider>
      </AccessProvider>
    </AuthProvider>
  );
};

export default App;
