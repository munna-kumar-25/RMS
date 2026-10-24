import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Building2,
  Users,
  LayoutGrid,
  UtensilsCrossed,
  Boxes,
  ShoppingBag,
  Flame,
  Receipt,
  Calculator,
  BarChart3,
  Settings,
  MapPin,
  Phone,
  Mail,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { useAppStore } from '../../store/AppStore.tsx';
import StatusBadge from '../../components/common/StatusBadge.tsx';
import { Order } from '../../types/index.ts';

interface BranchDetailsPageProps {
  branchId: string;
  onBack: () => void;
  onNavigate: (path: string) => void;
  onSelectOrder?: (order: Order) => void;
}

type TabType =
  | 'overview'
  | 'employees'
  | 'tables'
  | 'menu'
  | 'inventory'
  | 'orders'
  | 'kds'
  | 'expenses'
  | 'accounting'
  | 'reports'
  | 'settings';

export const BranchDetailsPage: React.FC<BranchDetailsPageProps> = ({
  branchId,
  onBack,
  onNavigate,
  onSelectOrder,
}) => {
  const {
    branches,
    updateBranch,
    employees,
    tables,
    sections,
    menuItems,
    inventoryItems,
    orders,
    kots,
    expenses,
    ledgers,
    transactions,
    setActiveBranchId,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const branch = branches.find((b) => b._id === branchId);

  // Tab-scoped data
  const branchEmployees = useMemo(
    () => employees.filter((e) => e.branchId === branch?._id),
    [employees, branch]
  );

  const branchTables = useMemo(
    () => tables.filter((t) => t.branchId === branch?._id),
    [tables, branch]
  );

  const branchSections = useMemo(
    () => sections.filter((s) => s.branchId === branch?._id),
    [sections, branch]
  );

  const branchInventory = useMemo(
    () => inventoryItems.filter((i) => i.branchId === branch?._id),
    [inventoryItems, branch]
  );

  const branchOrders = useMemo(
    () => orders.filter((o) => o.branchId === branch?._id),
    [orders, branch]
  );

  const branchKots = useMemo(
    () => kots.filter((k) => k.branchId === branch?._id),
    [kots, branch]
  );

  const branchExpenses = useMemo(
    () => expenses.filter((e) => e.branchId === branch?._id),
    [expenses, branch]
  );

  const branchLedgers = useMemo(
    () => ledgers.filter((l) => l.branchId === branch?._id),
    [ledgers, branch]
  );

  const branchTransactions = useMemo(
    () => transactions.filter((t) => t.branchId === branch?._id),
    [transactions, branch]
  );

  if (!branch) {
    return (
      <div className="p-12 text-center">
        <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Branch not found</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-3 text-xs font-semibold text-indigo-600 hover:underline"
        >
          ← Return to branches list
        </button>
      </div>
    );
  }

  const tabs: { id: TabType; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'overview', label: 'Overview', icon: <Building2 className="w-3.5 h-3.5" /> },
    { id: 'employees', label: 'Staff & Roles', icon: <Users className="w-3.5 h-3.5" />, count: branchEmployees.length },
    { id: 'tables', label: 'Floor & Tables', icon: <LayoutGrid className="w-3.5 h-3.5" />, count: branchTables.length },
    { id: 'menu', label: 'Branch Menu', icon: <UtensilsCrossed className="w-3.5 h-3.5" />, count: menuItems.length },
    { id: 'inventory', label: 'Raw Materials', icon: <Boxes className="w-3.5 h-3.5" />, count: branchInventory.length },
    { id: 'orders', label: 'Orders Feed', icon: <ShoppingBag className="w-3.5 h-3.5" />, count: branchOrders.length },
    { id: 'kds', label: 'Kitchen KDS', icon: <Flame className="w-3.5 h-3.5" />, count: branchKots.length },
    { id: 'expenses', label: 'Expense Ledger', icon: <Receipt className="w-3.5 h-3.5" />, count: branchExpenses.length },
    { id: 'accounting', label: 'Accounts & Ledgers', icon: <Calculator className="w-3.5 h-3.5" /> },
    { id: 'reports', label: 'Analytics', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { id: 'settings', label: 'Configuration', icon: <Settings className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Top Navigation & Branch Hero Header */}
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Branches Directory</span>
        </button>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-mono font-bold px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 rounded-lg">
                {branch.code}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  branch.isActive
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400'
                }`}
              >
                {branch.isActive ? 'Active Location' : 'Suspended'}
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">
              {branch.name}
            </h1>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {branch.contact.address.street}, {branch.contact.address.city},{' '}
                {branch.contact.address.state} • Phone: {branch.contact.phone}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setActiveBranchId(branch._id);
                onNavigate('/admin/dashboard');
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm shadow-indigo-600/20 transition-colors"
            >
              Set Active Branch Scope
            </button>
          </div>
        </div>
      </div>

      {/* 11 Tab Navigation Bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2 border-b border-slate-200 dark:border-slate-800 scrollbar-thin">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div>
        {/* 1. OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Today's Gross Sales
                </span>
                <span className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1 block">
                  ₹{branch.todayRevenue.toLocaleString()}
                </span>
              </div>

              <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Today's Order Count
                </span>
                <span className="text-xl font-black text-slate-900 dark:text-white mt-1 block">
                  {branch.todayOrders}
                </span>
              </div>

              <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Active Staff
                </span>
                <span className="text-xl font-black text-slate-900 dark:text-white mt-1 block">
                  {branchEmployees.length}
                </span>
              </div>

              <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Dining Tables
                </span>
                <span className="text-xl font-black text-slate-900 dark:text-white mt-1 block">
                  {branchTables.length}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Branch Tax & Operations Details */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Tax & Regulatory Configuration
                </h3>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  <div className="py-2 flex justify-between">
                    <span className="text-slate-500">GSTIN / Tax Reg #</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {branch.taxDetails.taxRegNumber}
                    </span>
                  </div>
                  <div className="py-2 flex justify-between">
                    <span className="text-slate-500">Default Tax Rate (GST)</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {branch.taxDetails.defaultTaxRate}%
                    </span>
                  </div>
                  <div className="py-2 flex justify-between">
                    <span className="text-slate-500">Base Currency</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {branch.settings.currency} (₹)
                    </span>
                  </div>
                  <div className="py-2 flex justify-between">
                    <span className="text-slate-500">KDS Enabled</span>
                    <span className="font-bold text-emerald-600">
                      {branch.settings.enableKDS ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="py-2 flex justify-between">
                    <span className="text-slate-500">Offline POS Mode</span>
                    <span className="font-bold text-emerald-600">
                      {branch.settings.allowOfflineBilling ? 'Permitted' : 'Disabled'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Manager & Contact */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Branch Leadership & Contact
                </h3>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  <div className="py-2 flex justify-between">
                    <span className="text-slate-500">General Manager</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {branch.managerName || 'Assigned Branch Admin'}
                    </span>
                  </div>
                  <div className="py-2 flex justify-between">
                    <span className="text-slate-500">Contact Email</span>
                    <span className="font-mono text-slate-900 dark:text-white">
                      {branch.contact.email}
                    </span>
                  </div>
                  <div className="py-2 flex justify-between">
                    <span className="text-slate-500">Contact Phone</span>
                    <span className="font-mono text-slate-900 dark:text-white">
                      {branch.contact.phone}
                    </span>
                  </div>
                  <div className="py-2 flex justify-between">
                    <span className="text-slate-500">Postal Code</span>
                    <span className="font-mono text-slate-900 dark:text-white">
                      {branch.contact.address.postalCode}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. EMPLOYEES TAB */}
        {activeTab === 'employees' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Staff Members Assigned to {branch.name}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Employee ID</th>
                    <th className="py-2.5 px-3">Name</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3">Email & Phone</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {branchEmployees.map((emp) => (
                    <tr key={emp._id}>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                        {emp.employeeId}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                        {emp.name}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold">
                          {emp.role}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        {emp.email} • {emp.phone}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                          {emp.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. TABLES & FLOOR TAB */}
        {activeTab === 'tables' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {branchTables.map((t) => (
                <div
                  key={t._id}
                  className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      Table {t.tableNumber}
                    </span>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="text-[11px] text-slate-500 space-y-0.5">
                    <div>Section: {t.sectionName}</div>
                    <div>Capacity: {t.capacity} Guests</div>
                    {t.activeOrderAmount && (
                      <div className="text-emerald-600 font-bold">
                        Active Order: ₹{t.activeOrderAmount}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. MENU TAB */}
        {activeTab === 'menu' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Menu Items Available at {branch.name}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {menuItems.map((item) => (
                <div
                  key={item._id}
                  className="p-3 border border-slate-100 dark:border-slate-800 rounded-xl flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">
                      {item.name}
                    </span>
                    <span className="text-[10px] text-slate-400">{item.categoryName}</span>
                  </div>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    ₹{item.price}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. INVENTORY TAB */}
        {activeTab === 'inventory' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Raw Materials & Ingredients at {branch.name}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Item</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Stock Level</th>
                    <th className="py-2.5 px-3">Unit Cost</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {branchInventory.map((item) => (
                    <tr key={item._id}>
                      <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                        {item.name}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">{item.category}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                        {item.currentStock} {item.unit}
                      </td>
                      <td className="py-2.5 px-3 font-mono">₹{item.unitCost}</td>
                      <td className="py-2.5 px-3">
                        <StatusBadge status={item.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 6. ORDERS FEED TAB */}
        {activeTab === 'orders' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Order Transactions ({branchOrders.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Order #</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Total (₹)</th>
                    <th className="py-2.5 px-3">Payment</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {branchOrders.map((ord) => (
                    <tr key={ord._id}>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                        #{ord.orderNumber}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{ord.orderType}</td>
                      <td className="py-2.5 px-3">
                        <StatusBadge status={ord.status} />
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                        ₹{ord.grandTotal}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">{ord.payment.method}</td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => onSelectOrder && onSelectOrder(ord)}
                          className="text-xs font-bold text-indigo-600 hover:underline"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 7. KDS TAB */}
        {activeTab === 'kds' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {branchKots.map((kot) => (
              <div
                key={kot._id}
                className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-white">KOT #{kot.kotNumber}</span>
                  <StatusBadge status={kot.status} />
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {kot.items.map((it, i) => (
                    <div key={i} className="py-1 flex justify-between">
                      <span>{it.name}</span>
                      <span className="font-bold">x{it.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 8. EXPENSES TAB */}
        {activeTab === 'expenses' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Branch Operational Expenses
            </h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {branchExpenses.map((exp) => (
                <div key={exp._id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">
                      {exp.title}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {exp.category} • Paid to {exp.paidTo} • {exp.date}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    ₹{exp.amount.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 9. ACCOUNTING TAB */}
        {activeTab === 'accounting' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Ledger Accounts for {branch.name}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {branchLedgers.map((l) => (
                  <div
                    key={l._id}
                    className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs"
                  >
                    <span className="text-[10px] font-mono text-slate-400 block">{l.accountCode}</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">{l.accountName}</span>
                    <span className="text-sm font-mono font-bold text-indigo-600 mt-1 block">
                      ₹{l.balance.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 10. REPORTS TAB */}
        {activeTab === 'reports' && (
          <div className="p-8 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2">
            <BarChart3 className="w-10 h-10 text-indigo-600 mx-auto" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Branch Analytics & Audit Aggregations
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Export comprehensive P&L, food cost variances, and staff productivity reports for {branch.name}.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('/admin/reports')}
              className="mt-3 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors"
            >
              Open Full Reports Engine
            </button>
          </div>
        )}

        {/* 11. SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 max-w-2xl">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Location Settings: {branch.name}
            </h3>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Branch Name
                </label>
                <input
                  type="text"
                  value={branch.name}
                  onChange={(e) => updateBranch(branch._id, { name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    GST Registration Number
                  </label>
                  <input
                    type="text"
                    value={branch.taxDetails.taxRegNumber}
                    onChange={(e) =>
                      updateBranch(branch._id, {
                        taxDetails: { ...branch.taxDetails, taxRegNumber: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Default Tax Rate (%)
                  </label>
                  <input
                    type="number"
                    value={branch.taxDetails.defaultTaxRate}
                    onChange={(e) =>
                      updateBranch(branch._id, {
                        taxDetails: {
                          ...branch.taxDetails,
                          defaultTaxRate: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
                <div>
                  <span className="font-bold text-slate-900 dark:text-white block">
                    Kitchen Display System (KDS)
                  </span>
                  <span className="text-slate-400">Stream orders directly to kitchen screens</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateBranch(branch._id, {
                      settings: { ...branch.settings, enableKDS: !branch.settings.enableKDS },
                    })
                  }
                >
                  {branch.settings.enableKDS ? (
                    <ToggleRight className="w-6 h-6 text-indigo-600" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-slate-400" />
                  )}
                </button>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
                <div>
                  <span className="font-bold text-slate-900 dark:text-white block">
                    Offline POS Billing Mode
                  </span>
                  <span className="text-slate-400">Allow counter cashiers to bill without internet</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateBranch(branch._id, {
                      settings: {
                        ...branch.settings,
                        allowOfflineBilling: !branch.settings.allowOfflineBilling,
                      },
                    })
                  }
                >
                  {branch.settings.allowOfflineBilling ? (
                    <ToggleRight className="w-6 h-6 text-indigo-600" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-slate-400" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BranchDetailsPage;

