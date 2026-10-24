import React, { useState, useMemo } from 'react';
import {
  Building2,
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Flame,
  AlertTriangle,
  Receipt,
  Wallet,
  ArrowUpRight,
  Filter,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { useAppStore } from '../../store/AppStore.tsx';
import StatCard from '../../components/common/StatCard.tsx';
import StatusBadge from '../../components/common/StatusBadge.tsx';
import {
  StackedAreaChart,
  BarChart,
  DonutChart,
} from '../../components/common/ChartPrimitives.tsx';
import { Order } from '../../types/index.ts';
import { getMaterialStockStatus, getMenuItemStockStatus } from '../../utils/inventoryStatus.js';
import { getDashboardDateRange } from '../../utils/dashboardDateRange.js';
import { getActualRevenueByBranch, getActualRevenueOrders, getStackedRevenueTrajectory } from '../../utils/dashboardRevenue.js';

interface DashboardPageProps {
  onNavigate: (path: string) => void;
  onSelectOrder?: (order: Order) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onNavigate,
  onSelectOrder,
}) => {
  const {
    activeBranchId,
    activeBranch,
    branches,
    orders,
    kots,
    inventoryItems,
    expenses,
    menuItems,
    addStock,
    dashboardDataStatus,
    retryDashboardData,
  } = useAppStore();

  const [timeRange, setTimeRange] = useState<'all' | 'today' | '7d' | '30d'>('all');

  // Filter entities according to activeBranchId (if null => global)
  const branchFilteredOrders = useMemo(() => {
    if (!activeBranchId) return orders;
    return orders.filter((o) => String(o.branchId) === String(activeBranchId));
  }, [orders, activeBranchId]);

  const branchFilteredKots = useMemo(() => {
    if (!activeBranchId) return kots;
    return kots.filter((k) => k.branchId === activeBranchId);
  }, [kots, activeBranchId]);

  const branchFilteredInventory = useMemo(() => {
    if (!activeBranchId) return inventoryItems;
    return inventoryItems.filter((i) => i.branchId === activeBranchId);
  }, [inventoryItems, activeBranchId]);

  const branchFilteredMenuItems = useMemo(() => {
    if (!activeBranchId) return menuItems;
    return menuItems.filter((item) => item.branchId === activeBranchId);
  }, [menuItems, activeBranchId]);

  const branchFilteredExpenses = useMemo(() => {
    if (!activeBranchId) return expenses;
    return expenses.filter((e) => e.branchId === activeBranchId);
  }, [expenses, activeBranchId]);

  const dateFilteredOrders = useMemo(() => {
    const { start, end } = getDashboardDateRange(timeRange);
    return orders.filter((order) => {
      const createdAt = new Date(order.createdAt);
      return !Number.isNaN(createdAt.getTime()) && createdAt >= start && createdAt <= end;
    });
  }, [orders, timeRange]);

  const selectedOrders = useMemo(
    () => activeBranchId
      ? dateFilteredOrders.filter((order) => String(order.branchId) === String(activeBranchId))
      : dateFilteredOrders,
    [dateFilteredOrders, activeBranchId]
  );

  const selectedExpenses = useMemo(() => {
    const { start, end } = getDashboardDateRange(timeRange);
    return branchFilteredExpenses.filter((expense) => {
      const expenseDate = new Date(expense.date || expense.createdAt);
      return !Number.isNaN(expenseDate.getTime()) && expenseDate >= start && expenseDate <= end;
    });
  }, [branchFilteredExpenses, timeRange]);

  const actualRevenueOrders = useMemo(
    () => getActualRevenueOrders(selectedOrders, activeBranchId),
    [selectedOrders, activeBranchId]
  );

  // Aggregate Metrics
  const totalRevenue = useMemo(() => {
    return actualRevenueOrders.reduce((sum, order) => sum + (Number(order.grandTotal) || 0), 0);
  }, [actualRevenueOrders]);

  const totalExpenseAmount = useMemo(() => {
    return selectedExpenses.reduce((sum, e) => sum + e.amount, 0);
  }, [selectedExpenses]);

  const netProfit = totalRevenue - totalExpenseAmount;
  const nonCancelledOrders = selectedOrders.filter((order) => order.status !== 'CANCELLED');
  const paidOrders = actualRevenueOrders;
  const pendingKots = branchFilteredKots.filter((k) => k.status === 'PENDING' || k.status === 'PREPARING').length;
  const lowStockAlerts = useMemo(() => [
    ...branchFilteredInventory
      .filter((item) => {
        const status = getMaterialStockStatus(item);
        return status === 'LOW_STOCK' || status === 'OUT_OF_STOCK';
      })
      .map((item) => ({
        id: `material:${item._id}`,
        name: item.name,
        itemType: 'Raw material',
        branchName: item.branchName,
        stock: Number(item.currentStock) || 0,
        threshold: Number(item.minimumStock) || 0,
        unit: item.unit,
        status: getMaterialStockStatus(item),
        inventoryItemId: item._id,
      })),
    ...branchFilteredMenuItems
      .filter((item) => {
        const status = getMenuItemStockStatus(item);
        return status === 'LOW_STOCK' || status === 'OUT_OF_STOCK';
      })
      .map((item) => ({
        id: `menu-item:${item._id}`,
        name: item.name,
        itemType: 'Menu item',
        branchName: item.branchName,
        stock: Number(item.stockQuantity) || 0,
        threshold: Number(item.minimumStockQuantity) || 0,
        unit: 'portions',
        status: getMenuItemStockStatus(item),
        inventoryItemId: null,
      })),
  ], [branchFilteredInventory, branchFilteredMenuItems]);
  const avgOrderValue = paidOrders.length > 0 ? Math.round(totalRevenue / paidOrders.length) : 0;

  // Chart Data: Hourly / Daily Revenue Line
  const revenueChartData = useMemo(() => {
    const chartBranches = activeBranchId
      ? branches.filter((branch) => String(branch._id) === String(activeBranchId))
      : branches;
    return getStackedRevenueTrajectory(actualRevenueOrders, chartBranches, timeRange);
  }, [actualRevenueOrders, branches, activeBranchId, timeRange]);

  // Comparative Branch Performance Bar Chart
  const branchComparisonData = useMemo(() => {
    return getActualRevenueByBranch(dateFilteredOrders, branches, activeBranchId);
  }, [dateFilteredOrders, branches, activeBranchId]);

  // Order Type Distribution Donut
  const orderTypeData = useMemo(() => {
    const dineIn = nonCancelledOrders.filter((o) => o.orderType === 'DINE_IN').length;
    const takeaway = nonCancelledOrders.filter((o) => o.orderType === 'TAKEAWAY').length;
    const delivery = nonCancelledOrders.filter((o) => o.orderType === 'DELIVERY').length;
    return [
      { label: 'Dine-In', value: dineIn, color: '#4f46e5' },
      { label: 'Takeaway', value: takeaway, color: '#06b6d4' },
      { label: 'Delivery', value: delivery, color: '#10b981' },
    ].filter((slice) => slice.value > 0);
  }, [nonCancelledOrders]);

  // Payment Breakdown Donut
  const paymentBreakdownData = useMemo(() => {
    const upi = nonCancelledOrders.filter((o) => o.payment.method === 'UPI').length;
    const card = nonCancelledOrders.filter((o) => o.payment.method === 'CARD').length;
    const cash = nonCancelledOrders.filter((o) => o.payment.method === 'CASH').length;
    return [
      { label: 'UPI / QR', value: upi, color: '#6366f1' },
      { label: 'Card / POS', value: card, color: '#f59e0b' },
      { label: 'Cash / Petty', value: cash, color: '#10b981' },
    ].filter((slice) => slice.value > 0);
  }, [nonCancelledOrders]);

  // Top 5 Selling items
  const topSellingItems = useMemo(() => {
    const sales = new Map<string, { name: string; unitsSold: number; totalSales: number }>();
    nonCancelledOrders.forEach((order) => {
      order.items.forEach((item) => {
        const existing = sales.get(item.itemId) || { name: item.name, unitsSold: 0, totalSales: 0 };
        existing.unitsSold += item.quantity;
        existing.totalSales += item.quantity * item.price;
        sales.set(item.itemId, existing);
      });
    });

    return Array.from(sales.values()).sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 5);
  }, [nonCancelledOrders, menuItems]);

  const hasOperationalData = dashboardDataStatus === 'ready';

  return (
    <div className="space-y-6">
      {/* Top Welcome & Operational Scope Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-6 rounded-3xl shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-1">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Operational Headquarters Overview</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-3">
            {activeBranch ? activeBranch.name : 'All Branches (Global HQ)'}
            {activeBranch && (
              <span className="text-xs px-2.5 py-1 font-mono font-bold bg-white/10 text-white rounded-lg border border-white/20">
                {activeBranch.code}
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-300 mt-1">
            {dashboardDataStatus === 'loading'
              ? 'Loading authorized branch records…'
              : dashboardDataStatus === 'error'
                ? 'Dashboard data could not be loaded.'
                : dashboardDataStatus === 'empty'
                  ? 'No accessible branches are available in this company.'
                  : hasOperationalData
                    ? (activeBranch
                      ? `Branch view for ${activeBranch.contact.address.city}.`
                      : `Records loaded for ${branches.length} ${branches.length === 1 ? 'branch' : 'branches'}.`)
                    : 'Dashboard data is waiting for an authenticated session.'}
          </p>
          {(dashboardDataStatus === 'error' || dashboardDataStatus === 'empty') && (
            <button type="button" onClick={retryDashboardData} className="mt-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20">
              {dashboardDataStatus === 'error' ? 'Retry dashboard data' : 'Refresh access'}
            </button>
          )}
        </div>

        {/* Time range toggle */}
        <div className="flex items-center gap-1.5 p-1 bg-white/10 backdrop-blur-md rounded-2xl border border-white/15">
          <button
            type="button"
            onClick={() => setTimeRange('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${timeRange === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:text-white'
              }`}
          >
            All Time
          </button>
          <button
            type="button"
            onClick={() => setTimeRange('today')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${timeRange === 'today' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:text-white'
              }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setTimeRange('7d')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${timeRange === '7d' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:text-white'
              }`}
          >
            7 Days
          </button>
          <button
            type="button"
            onClick={() => setTimeRange('30d')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${timeRange === '30d' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:text-white'
              }`}
          >
            30 Days
          </button>
        </div>
      </div>

      {/* 8 Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Actual Revenue"
          value={hasOperationalData ? `₹${totalRevenue.toLocaleString()}` : dashboardDataStatus === 'loading' ? 'Loading…' : 'Unavailable'}
          icon={<DollarSign className="w-5 h-5" />}
          variant="indigo"
          description={hasOperationalData ? 'from paid orders in the selected view' : 'Awaiting branch data'}
        />

        <StatCard
          title="Total Order Count"
          value={hasOperationalData ? nonCancelledOrders.length : dashboardDataStatus === 'loading' ? 'Loading…' : 'Unavailable'}
          icon={<ShoppingBag className="w-5 h-5" />}
          variant="default"
          description={hasOperationalData ? 'orders in selected period' : 'Awaiting branch data'}
        />

        <StatCard
          title="Live Kitchen KOTs"
          value={hasOperationalData ? pendingKots : dashboardDataStatus === 'loading' ? 'Loading…' : 'Unavailable'}
          icon={<Flame className="w-5 h-5" />}
          variant="amber"
          description={hasOperationalData ? 'from loaded tickets' : 'Awaiting branch data'}
        />

        <StatCard
          title="Critical Low Stock"
          value={hasOperationalData ? lowStockAlerts.length : dashboardDataStatus === 'loading' ? 'Loading…' : 'Unavailable'}
          icon={<AlertTriangle className="w-5 h-5" />}
          variant="rose"
          description={hasOperationalData ? 'low and out-of-stock items' : 'Awaiting branch data'}
        />

        <StatCard
          title="Operating Expenses"
          value={hasOperationalData ? `₹${totalExpenseAmount.toLocaleString()}` : dashboardDataStatus === 'loading' ? 'Loading…' : 'Unavailable'}
          icon={<Receipt className="w-5 h-5" />}
          variant="default"
          description={hasOperationalData ? 'from loaded vouchers' : 'Awaiting branch data'}
        />

        <StatCard
          title="Net Operating Profit"
          value={hasOperationalData ? `₹${netProfit.toLocaleString()}` : dashboardDataStatus === 'loading' ? 'Loading…' : 'Unavailable'}
          icon={<Wallet className="w-5 h-5" />}
          variant="emerald"
          description={hasOperationalData ? 'orders minus expenses' : 'Awaiting branch data'}
        />

        <StatCard
          title="Average Order Value"
          value={hasOperationalData ? `₹${avgOrderValue}` : dashboardDataStatus === 'loading' ? 'Loading…' : 'Unavailable'}
          icon={<TrendingUp className="w-5 h-5" />}
          variant="default"
          description={hasOperationalData ? 'from loaded orders' : 'Awaiting branch data'}
        />

        <StatCard
          title="Active Locations"
          value={hasOperationalData ? (activeBranch ? '1 / 1' : `${branches.length} Branches`) : dashboardDataStatus === 'loading' ? 'Loading…' : 'Unavailable'}
          icon={<Building2 className="w-5 h-5" />}
          variant="indigo"
          description={hasOperationalData ? 'in the current view' : 'Awaiting branch data'}
        />
      </div>

      {hasOperationalData ? (
        <>
          {/* Interactive Charts Row 1: Line & Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <StackedAreaChart
                data={revenueChartData.data}
                series={revenueChartData.series}
                title="Actual Revenue Trajectory"
                height={280}
              />
            </div>

            <div className="lg:col-span-1">
              <BarChart
                data={branchComparisonData}
                title="Actual Revenue by Branch"
                height={280}
              />
            </div>
          </div>

          {/* Interactive Charts Row 2: Donut Distributions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DonutChart
              data={orderTypeData}
              title="Dining Mode Breakdown (Dine-in vs Online)"
              height={260}
            />

            <DonutChart
              data={paymentBreakdownData}
              title="Settlement Method Distribution"
              height={260}
            />
          </div>

          {/* Tables & Action Grids: Recent Orders & Top Selling Items */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent Orders List (2 cols) */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Live Orders Feed
                  </h3>
                  <p className="text-xs text-slate-400">Recent ticket requests across dining sections</p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('/admin/orders')}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                >
                  <span>View All Orders</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Order #</th>
                      <th className="py-2.5 px-3">Branch</th>
                      <th className="py-2.5 px-3">Type / Table</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Total</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {branchFilteredOrders.length > 0 ? branchFilteredOrders.slice(0, 6).map((order) => (
                      <tr key={order._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">#{order.orderNumber}</td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 truncate max-w-[120px]">{order.branchName}</td>
                        <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                          {order.orderType === 'DINE_IN' ? `Table ${order.tableNumber || '-'} (${order.sectionName || '-'})` : order.orderType}
                        </td>
                        <td className="py-2.5 px-3"><StatusBadge status={order.status} /></td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">₹{order.grandTotal}</td>
                        <td className="py-2.5 px-3 text-right">
                          <button type="button" onClick={() => onSelectOrder && onSelectOrder(order)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">Inspect</button>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={6} className="py-10 text-center">
                          <ShoppingBag className="mx-auto w-7 h-7 text-slate-300 dark:text-slate-600" />
                          <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">No orders recorded yet</p>
                          <p className="mt-1 text-[11px] text-slate-400">New tickets will appear here in real time.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top 5 Selling Menu Items & Critical Low Stock (1 col) */}
            <div className="space-y-6">
              {/* Top Selling Items */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Top Selling Dishes
                </h3>

                <div className="space-y-3">
                  {topSellingItems.length > 0 ? topSellingItems.map((item, idx) => (
                    <div key={item._id} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black text-[10px] flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div>
                          <span className="font-bold text-slate-800 dark:text-slate-200 block truncate max-w-[140px]">
                            {item.name}
                          </span>
                          <span className="text-[10px] text-slate-400">{item.unitsSold} orders</span>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        ₹{item.totalSales.toLocaleString()}
                      </span>
                    </div>
                  )) : (
                    <div className="py-6 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">No sales data yet</p>
                      <p className="mt-1 text-[11px] text-slate-400">Top dishes will appear after orders are completed.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Low Stock Urgent Widget */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                    <span>Stock Alerts</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => onNavigate('/admin/inventory')}
                    className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold"
                  >
                    Inventory
                  </button>
                </div>

                {lowStockAlerts.length === 0 ? (
                  <p className="text-xs text-emerald-600">No menu items or raw materials are low or out of stock.</p>
                ) : (
                  <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                    {lowStockAlerts.map((item) => (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-800 dark:text-slate-200 block">
                            {item.name}
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            {item.itemType}{item.branchName ? ` · ${item.branchName}` : ''}
                          </span>
                          <span className={`block text-[10px] font-mono ${item.status === 'OUT_OF_STOCK' ? 'text-rose-700 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300'}`}>
                            {item.status === 'OUT_OF_STOCK' ? 'OUT OF STOCK' : 'LOW STOCK'} · {item.stock} {item.unit} left (Min: {item.threshold})
                          </span>
                        </div>
                        {item.inventoryItemId && (
                          <button
                            type="button"
                            onClick={() => addStock(item.inventoryItemId, 20)}
                            className="ml-3 shrink-0 px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-[10px] font-bold text-slate-700 dark:text-slate-200 rounded-lg shadow-2xs"
                          >
                            +20 {item.unit}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <section className="relative overflow-hidden rounded-3xl bg-slate-950 p-6 md:p-8 text-white shadow-xl shadow-slate-200/60 dark:shadow-none">
          <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full border border-cyan-300/20" />
          <div className="absolute right-8 -top-16 h-48 w-48 rounded-full border border-indigo-300/10" />
          <div className="relative max-w-3xl">
            <span className="inline-flex items-center rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200">
              Workspace setup
            </span>
            <h2 className="mt-4 text-2xl font-black tracking-tight md:text-3xl">Not connected yet</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
              Revenue, orders, kitchen activity, and stock figures are not live. They appear here only after operational records are loaded from the API.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => onNavigate('/admin/branches')}
                className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-left transition-colors hover:bg-white/15"
              >
                <span className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-cyan-300" />
                  <span>
                    <span className="block text-sm font-bold">Create a branch</span>
                    <span className="mt-0.5 block text-[11px] text-slate-400">Set your operating location</span>
                  </span>
                </span>
                <ArrowUpRight className="h-4 w-4 text-slate-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/admin/menu')}
                className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-left transition-colors hover:bg-white/15"
              >
                <span className="flex items-center gap-3">
                  <ShoppingBag className="h-5 w-5 text-amber-300" />
                  <span>
                    <span className="block text-sm font-bold">Build your menu</span>
                    <span className="mt-0.5 block text-[11px] text-slate-400">Add dishes and pricing</span>
                  </span>
                </span>
                <ArrowUpRight className="h-4 w-4 text-slate-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default DashboardPage;
