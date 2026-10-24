import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  Calendar,
  Download,
  FileSpreadsheet,
  DollarSign,
  TrendingUp,
  Users,
  Utensils,
  Boxes,
} from 'lucide-react';
import { useAppStore } from '../../store/AppStore.tsx';
import {
  LineChart,
  DonutChart,
} from '../../components/common/ChartPrimitives.tsx';

export const ReportsPage: React.FC = () => {
  const {
    activeBranchId,
    activeBranch,
    orders,
    menuItems,
    inventoryItems,
    expenses,
    employees,
    recipes,
  } = useAppStore();

  const [timeRange, setTimeRange] = useState<'today' | '7d' | '30d'>('30d');
  const [activeTab, setActiveTab] = useState<'sales' | 'menu' | 'inventory' | 'pnl' | 'staff'>('sales');
  const [exportError, setExportError] = useState('');

  const periodStart = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    if (timeRange === '7d') start.setDate(start.getDate() - 6);
    if (timeRange === '30d') start.setDate(start.getDate() - 29);
    return start;
  }, [timeRange]);

  const periodOrders = useMemo(() => {
    if (!activeBranchId) return orders;
    return orders.filter((order) => order.branchId === activeBranchId);
  }, [orders, activeBranchId]).filter((order) => new Date(order.createdAt) >= periodStart);

  const paidOrders = periodOrders.filter((order) => order.status === 'PAID');
  const grossSales = paidOrders.reduce((sum, order) => sum + order.grandTotal, 0);
  const totalTaxes = paidOrders.reduce((sum, order) => sum + order.taxAmount, 0);
  const netSales = grossSales - totalTaxes;
  const recipeCosts = new Map(recipes.map((recipe) => [recipe.menuItemId, recipe.totalRecipeCost]));
  const actualCogs = paidOrders.reduce((sum, order) => sum + order.items.reduce(
    (lineTotal, item) => lineTotal + (recipeCosts.get(item.itemId) || 0) * item.quantity,
    0
  ), 0);
  const grossMargin = netSales - actualCogs;
  const periodExpenses = expenses.filter((expense) => {
    const branchMatches = !activeBranchId || expense.branchId === activeBranchId;
    return branchMatches && expense.status === 'APPROVED' && new Date(expense.date || expense.createdAt) >= periodStart;
  });
  const totalOpex = periodExpenses.reduce((sum, expense) => sum + expense.amount + (expense.taxAmount || 0), 0);
  const netOperatingIncome = grossMargin - totalOpex;

  const salesTrendData = useMemo(() => {
    const salesByDay = new Map<string, number>();
    for (const order of paidOrders) {
      const date = new Date(order.createdAt);
      const label = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      salesByDay.set(label, (salesByDay.get(label) || 0) + order.grandTotal);
    }
    return [...salesByDay].map(([label, value]) => ({ label, value }));
  }, [paidOrders]);

  const hourlyDistributionData = useMemo(() => {
    const periods = [
      { label: '00–11', value: 0, color: '#4f46e5' },
      { label: '11–15', value: 0, color: '#06b6d4' },
      { label: '15–20', value: 0, color: '#6366f1' },
      { label: '20–24', value: 0, color: '#10b981' },
    ];
    paidOrders.forEach((order) => {
      const hour = new Date(order.createdAt).getHours();
      const index = hour < 11 ? 0 : hour < 15 ? 1 : hour < 20 ? 2 : 3;
      periods[index].value += 1;
    });
    return periods;
  }, [paidOrders]);

  const categoryShareData = useMemo(() => {
    const categories = new Map<string, number>();
    paidOrders.forEach((order) => order.items.forEach((line) => {
      const menuItem = menuItems.find((item) => item._id === line.itemId);
      const category = menuItem?.categoryName || 'Uncategorised';
      categories.set(category, (categories.get(category) || 0) + line.price * line.quantity);
    }));
    const colors = ['#4f46e5', '#06b6d4', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6'];
    return [...categories].map(([label, value], index) => ({
      label,
      value,
      color: colors[index % colors.length],
    }));
  }, [paidOrders, menuItems]);

  const topMenuItems = useMemo(() => {
    const salesByItem = new Map<string, { name: string; quantity: number; revenue: number }>();
    paidOrders.forEach((order) => order.items.forEach((line) => {
      const item = salesByItem.get(line.itemId) || { name: line.name, quantity: 0, revenue: 0 };
      item.quantity += line.quantity;
      item.revenue += line.price * line.quantity;
      salesByItem.set(line.itemId, item);
    }));
    return [...salesByItem.values()].sort((left, right) => right.revenue - left.revenue).slice(0, 8);
  }, [paidOrders]);

  const staffMetrics = useMemo(() => {
    const handled = new Map<string, { count: number; sales: number }>();
    paidOrders.forEach((order) => {
      const name = order.waiterName || '';
      if (!name) return;
      const metric = handled.get(name) || { count: 0, sales: 0 };
      metric.count += 1;
      metric.sales += order.grandTotal;
      handled.set(name, metric);
    });
    return employees.map((employee) => ({
      employee,
      count: handled.get(employee.name)?.count || 0,
      sales: handled.get(employee.name)?.sales || 0,
    }));
  }, [employees, paidOrders]);

  const handleExportCSV = () => {
    setExportError('');
    try {
      let rows: (string | number)[][];
      if (activeTab === 'sales' || activeTab === 'pnl') {
        rows = [
          ['Order', 'Date', 'Branch', 'Status', 'Subtotal', 'Tax', 'Total', 'Payment method'],
          ...periodOrders.map((order) => [
            order.orderNumber,
            order.createdAt,
            order.branchName,
            order.status,
            order.subtotal,
            order.taxAmount,
            order.grandTotal,
            order.payment?.method || '',
          ]),
        ];
      } else if (activeTab === 'menu') {
        rows = [
          ['Category', 'Sales'],
          ...categoryShareData.map((item) => [item.label, item.value]),
        ];
      } else if (activeTab === 'inventory') {
        rows = [
          ['Item', 'Category', 'Current stock', 'Minimum stock', 'Unit', 'Unit cost'],
          ...inventoryItems.map((item) => [item.name, item.category, item.currentStock, item.minimumStock, item.unit, item.unitCost]),
        ];
      } else {
        rows = [
          ['Staff', 'Role', 'Paid orders handled', 'Gross sales'],
          ...staffMetrics.map(({ employee, count, sales }) => [employee.name, employee.role, count, sales]),
        ];
      }
      const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
      const file = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `rms-${activeTab}-report-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Could not export this report.');
    }
  };

  const handleExportPDF = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <BarChart3 className="w-6 h-6 text-indigo-600" />
            <span>Corporate Analytics & Reporting Engine</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Audited financial statements, dish margin matrix, inventory variances, and staff performance metrics.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm shadow-indigo-600/20"
          >
            <Download className="w-4 h-4" />
            <span>Print / Save PDF</span>
          </button>
        </div>
        {exportError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{exportError}</p>}
      </div>

      {/* Time Range Selector Strip */}
      <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
          <Calendar className="w-4 h-4 text-indigo-600" />
          <span>Reporting Period:</span>
        </div>

        <div className="flex items-center gap-1">
          {(['today', '7d', '30d'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setTimeRange(r)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                timeRange === r
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {r === 'today' ? 'Today' : r === '7d' ? '7 Days' : '30 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* 5 Report Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
        {[
          { id: 'sales', label: 'Sales & Hourly Traffic', icon: <DollarSign className="w-3.5 h-3.5" /> },
          { id: 'pnl', label: 'P&L Financial Statement', icon: <TrendingUp className="w-3.5 h-3.5" /> },
          { id: 'menu', label: 'Menu Matrix & Item Profitability', icon: <Utensils className="w-3.5 h-3.5" /> },
          { id: 'inventory', label: 'Inventory & Wastage Variance', icon: <Boxes className="w-3.5 h-3.5" /> },
          { id: 'staff', label: 'Staff Productivity & Speed', icon: <Users className="w-3.5 h-3.5" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      <div>
        {/* 1. SALES TAB */}
        {activeTab === 'sales' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <LineChart
                data={salesTrendData}
                title="Gross Sales Trajectory (₹)"
                height={280}
                strokeColor="#4f46e5"
              />
              <DonutChart
                data={hourlyDistributionData}
                title="Guest Traffic by Service Period"
                height={280}
              />
            </div>
          </div>
        )}

        {/* 2. P&L TAB */}
        {activeTab === 'pnl' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4 max-w-3xl mx-auto">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex justify-between items-center">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Executive Profit & Loss Statement
                </h3>
                <span className="text-xs text-slate-400">
                  Operational Period: {timeRange.toUpperCase()} • Scope: {activeBranch?.name || 'Consolidated HQ'}
                </span>
              </div>
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
                INR (₹)
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1.5 font-bold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-800">
                <span>1. Gross Sales Revenue</span>
                <span className="font-mono">₹{grossSales.toLocaleString()}</span>
              </div>

              <div className="flex justify-between py-1 text-slate-500 pl-4">
                <span>Less: Tax recorded on paid orders</span>
                <span className="font-mono">-₹{totalTaxes.toLocaleString()}</span>
              </div>

              <div className="flex justify-between py-1.5 font-bold text-indigo-600 dark:text-indigo-400 border-b border-slate-100 dark:border-slate-800">
                <span>2. Net Operational Revenue</span>
                <span className="font-mono">₹{netSales.toLocaleString()}</span>
              </div>

              <div className="flex justify-between py-1 text-slate-500 pl-4">
                <span>Less: Recipe-backed cost of goods sold</span>
                <span className="font-mono">-₹{actualCogs.toLocaleString()}</span>
              </div>

              <div className="flex justify-between py-1.5 font-bold text-emerald-600 border-b border-slate-100 dark:border-slate-800">
                <span>3. Gross Culinary Profit (Contribution Margin)</span>
                <span className="font-mono">₹{grossMargin.toLocaleString()}</span>
              </div>

              <div className="flex justify-between py-1 text-slate-500 pl-4">
                <span>Less: Branch Operational Expenses (Rent, Power, Salaries)</span>
                <span className="font-mono">-₹{totalOpex.toLocaleString()}</span>
              </div>

              <div className="pt-3 border-t-2 border-slate-900 dark:border-white flex justify-between text-base font-black text-slate-900 dark:text-white">
                <span>4. Net Operating Income (EBITDA)</span>
                <span className="font-mono text-indigo-600 dark:text-indigo-400">
                  ₹{netOperatingIncome.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 3. MENU MATRIX TAB */}
        {activeTab === 'menu' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <DonutChart
                data={categoryShareData}
                title="Revenue Contribution by Category"
                height={280}
              />
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Top-selling menu items
                </h3>
                {topMenuItems.length ? topMenuItems.map((item) => (
                  <div key={item.name} className="flex items-center justify-between border-b border-slate-100 py-2 text-xs last:border-0 dark:border-slate-800">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{item.name}<span className="ml-2 text-[10px] text-slate-400">{item.quantity} sold</span></span>
                    <span className="font-mono font-bold">₹{item.revenue.toLocaleString()}</span>
                  </div>
                )) : <p className="text-xs text-slate-400">No paid menu sales in this period.</p>}
              </div>
            </div>
          </div>
        )}

        {/* 4. INVENTORY TAB */}
        {activeTab === 'inventory' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Current Inventory Position
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Item Name</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">On hand</th>
                    <th className="py-2.5 px-3">Minimum</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Stock value (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {inventoryItems.slice(0, 100).map((item) => (
                      <tr key={item._id}>
                        <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200">
                          {item.name}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">{item.category}</td>
                        <td className="py-2.5 px-3 font-mono">
                          {item.currentStock} {item.unit}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold">
                          {item.minimumStock} {item.unit}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold">
                          <span className={item.status === 'IN_STOCK' ? 'text-emerald-600' : 'text-rose-600'}>
                            {item.status.replaceAll('_', ' ')}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-right text-slate-900 dark:text-white font-bold">
                          ₹{Math.round(item.currentStock * item.unitCost).toLocaleString()}
                        </td>
                      </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. STAFF TAB */}
        {activeTab === 'staff' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Waitstaff & Cashier Performance Audit
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Staff Name</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3">Orders Handled</th>
                    <th className="py-2.5 px-3">Gross Sales Generated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {staffMetrics.slice(0, 100).map(({ employee, count, sales }) => (
                    <tr key={employee._id}>
                      <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200">
                        {employee.name}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">{employee.role}</td>
                      <td className="py-2.5 px-3 font-mono font-bold">{count}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                        ₹{sales.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportsPage;
