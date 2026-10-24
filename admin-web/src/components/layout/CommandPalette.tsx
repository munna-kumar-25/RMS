import React, { useState, useEffect } from 'react';
import {
  Search,
  Building2,
  Users,
  UtensilsCrossed,
  Boxes,
  ShoppingBag,
  Truck,
  ArrowRight,
  X,
} from 'lucide-react';
import { useAppStore } from '../../store/AppStore.tsx';

interface CommandPaletteProps {
  onNavigate: (path: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ onNavigate }) => {
  const {
    isCommandPaletteOpen,
    setCommandPaletteOpen,
    branches,
    employees,
    menuItems,
    inventoryItems,
    orders,
    suppliers,
  } = useAppStore();

  const [query, setQuery] = useState('');

  // Global Ctrl + K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!isCommandPaletteOpen);
      }
      if (e.key === 'Escape' && isCommandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCommandPaletteOpen, setCommandPaletteOpen]);

  if (!isCommandPaletteOpen) return null;

  const trimmed = query.trim().toLowerCase();

  const matchedBranches = trimmed
    ? branches.filter(
        (b) => b.name.toLowerCase().includes(trimmed) || b.code.toLowerCase().includes(trimmed)
      )
    : branches.slice(0, 3);

  const matchedEmployees = trimmed
    ? employees.filter(
        (e) => e.name.toLowerCase().includes(trimmed) || e.role.toLowerCase().includes(trimmed)
      )
    : [];

  const matchedMenuItems = trimmed
    ? menuItems.filter(
        (m) => m.name.toLowerCase().includes(trimmed) || m.categoryName.toLowerCase().includes(trimmed)
      )
    : [];

  const matchedInventory = trimmed
    ? inventoryItems.filter(
        (i) => i.name.toLowerCase().includes(trimmed) || i.category.toLowerCase().includes(trimmed)
      )
    : [];

  const matchedOrders = trimmed
    ? orders.filter(
        (o) => o.orderNumber.toLowerCase().includes(trimmed) || (o.customerName && o.customerName.toLowerCase().includes(trimmed))
      )
    : [];

  const handleSelect = (path: string) => {
    setCommandPaletteOpen(false);
    setQuery('');
    onNavigate(path);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 md:pt-24 p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Search Input Bar */}
        <div className="relative flex items-center px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <Search className="w-5 h-5 text-slate-400 mr-3 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, search branches, orders, staff, inventory..."
            className="w-full text-sm bg-transparent border-none text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(false)}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-[60vh] overflow-y-auto p-2 space-y-3">
          {/* Quick Navigations */}
          {!trimmed && (
            <div>
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Quick Navigation
              </div>
              <div className="grid grid-cols-2 gap-1 mt-1">
                {[
                  { label: 'Branches Overview', path: '/admin/branches' },
                  { label: 'Live Kitchen KDS', path: '/admin/kitchen' },
                  { label: 'Orders & POS Terminal', path: '/admin/orders' },
                  { label: 'Inventory Stock Alerts', path: '/admin/inventory' },
                  { label: 'Financial Accounting', path: '/admin/accounting' },
                  { label: 'Analytics Reports', path: '/admin/reports' },
                ].map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => handleSelect(item.path)}
                    className="flex items-center justify-between px-3 py-2 text-xs rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-left transition-colors"
                  >
                    <span>{item.label}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Branches Section */}
          {matchedBranches.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Branches
              </div>
              <div className="space-y-0.5 mt-1">
                {matchedBranches.map((b) => (
                  <button
                    key={b._id}
                    type="button"
                    onClick={() => handleSelect(`/admin/branches/${b._id}`)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-800 dark:text-slate-200 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Building2 className="w-4 h-4 text-indigo-500" />
                      <span className="font-semibold">{b.name}</span>
                      <span className="font-mono text-[10px] text-slate-400">({b.code})</span>
                    </div>
                    <span className="text-[10px] text-slate-400">{b.contact.address.city}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Menu Items Section */}
          {matchedMenuItems.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Menu Items
              </div>
              <div className="space-y-0.5 mt-1">
                {matchedMenuItems.map((item) => (
                  <button
                    key={item._id}
                    type="button"
                    onClick={() => handleSelect('/admin/menu')}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-800 dark:text-slate-200 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <UtensilsCrossed className="w-4 h-4 text-amber-500" />
                      <span className="font-semibold">{item.name}</span>
                      <span className="text-[10px] text-slate-400">({item.categoryName})</span>
                    </div>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      ₹{item.price}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Inventory Items Section */}
          {matchedInventory.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Inventory Ingredients
              </div>
              <div className="space-y-0.5 mt-1">
                {matchedInventory.map((item) => (
                  <button
                    key={item._id}
                    type="button"
                    onClick={() => handleSelect('/admin/inventory')}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-800 dark:text-slate-200 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Boxes className="w-4 h-4 text-emerald-500" />
                      <span className="font-semibold">{item.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">({item.sku})</span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                      {item.currentStock} {item.unit}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Employees Section */}
          {matchedEmployees.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Employees
              </div>
              <div className="space-y-0.5 mt-1">
                {matchedEmployees.map((emp) => (
                  <button
                    key={emp._id}
                    type="button"
                    onClick={() => handleSelect('/admin/employees')}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-800 dark:text-slate-200 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Users className="w-4 h-4 text-sky-500" />
                      <span className="font-semibold">{emp.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{emp.role}</span>
                    </div>
                    <span className="text-[10px] text-slate-400">{emp.branchName}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Orders Section */}
          {matchedOrders.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Orders
              </div>
              <div className="space-y-0.5 mt-1">
                {matchedOrders.map((ord) => (
                  <button
                    key={ord._id}
                    type="button"
                    onClick={() => handleSelect('/admin/orders')}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-800 dark:text-slate-200 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <ShoppingBag className="w-4 h-4 text-violet-500" />
                      <span className="font-semibold font-mono">{ord.orderNumber}</span>
                      <span className="text-[10px] text-slate-400">
                        {ord.tableNumber ? `Table ${ord.tableNumber}` : ord.orderType}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      ₹{ord.grandTotal}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {trimmed &&
            matchedBranches.length === 0 &&
            matchedMenuItems.length === 0 &&
            matchedInventory.length === 0 &&
            matchedEmployees.length === 0 &&
            matchedOrders.length === 0 && (
              <div className="py-8 text-center text-xs text-slate-400">
                No matching results found for "{query}"
              </div>
            )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-between text-[11px] text-slate-400">
          <span>Navigate with mouse or keyboard</span>
          <span>Press ESC to exit</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
