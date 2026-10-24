import React, { useState, useMemo } from 'react';
import {
  UtensilsCrossed,
  Plus,
  Search,
  Filter,
  Clock,
  Edit2,
  Trash2,
  LoaderCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { useAppStore } from '../../store/AppStore.tsx';
import { useAccess } from '../../context/AccessContext.jsx';
import { MenuItem } from '../../types/index.ts';
import ConfirmDialog from '../../components/common/ConfirmDialog.tsx';
import api from '../../services/api.js';
import { createXlsxBuffer } from '../../utils/xlsxExport.js';

interface MenuPageProps {
  onOpenMenuItemModal: (item?: MenuItem | null) => void;
}

export const MenuPage: React.FC<MenuPageProps> = ({ onOpenMenuItemModal }) => {
  const {
    menuItems,
    deleteMenuItem,
    updateMenuItem,
    activeBranchId,
  } = useAppStore();
  const access = useAccess();

  const [selectedFoodType, setSelectedFoodType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [itemToDelete, setItemToDelete] = useState<MenuItem | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportNotice, setExportNotice] = useState('');

  // Filter items
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchBranch =
        !activeBranchId || item.branchAvailability.includes(activeBranchId);
      const matchType =
        selectedFoodType === 'ALL' || item.foodType === selectedFoodType;
      const matchSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchQuery.toLowerCase());

      return matchBranch && matchType && matchSearch;
    });
  }, [menuItems, activeBranchId, selectedFoodType, searchQuery]);

  const toggleItemAvailability = async (item: MenuItem) => {
    try {
      const response = await api.patch(`/menu/items/${item._id}/status`, { isAvailable: !item.isAvailable, status: !item.isAvailable ? 'ACTIVE' : 'INACTIVE' });
      const saved = response.data?.data || response.data;
      updateMenuItem(item._id, { isAvailable: saved.availability ?? !item.isAvailable });
    } catch (error) {
      console.error('[MenuPage] Availability update failed:', error);
    }
  };

  const handleDeleteConfirm = () => {
    if (itemToDelete) {
      api.delete(`/menu/items/${itemToDelete._id}`).then(() => {
        deleteMenuItem(itemToDelete._id);
        setItemToDelete(null);
      }).catch((error) => console.error('[MenuPage] Delete failed:', error));
    }
  };

  const handleExportMenu = async () => {
    setExporting(true);
    setExportError('');
    setExportNotice('');
    try {
      const branches = access.branches.filter((branch) => (
        branch.setupStatus !== 'archived'
        && (access.isCompanySuperAdmin || branch.permissions.includes('menu.read'))
      ));
      const branchItems = await Promise.all(branches.map(async (branch) => {
        const items: MenuItem[] = [];
        let page = 1;
        let totalPages = 1;
        do {
          const response = await api.get('/menu/items', {
            params: { branchId: branch.id, limit: 100, page },
          });
          const data = response.data?.data;
          if (!Array.isArray(data?.items)) {
            throw new Error(`The menu response for ${branch.name} was invalid.`);
          }
          items.push(...data.items);
          totalPages = Math.max(1, Number(data.pagination?.pages) || 1);
          page += 1;
        } while (page <= totalPages);
        return items.map((item) => ({ ...item, branchName: branch.name }));
      }));
      const exportedItems = branchItems.flat();
      if (!exportedItems.length) {
        setExportNotice('There are no menu items available to export.');
        return;
      }

      const rows = [
        ['Branch', 'Menu Item', 'SKU', 'Category', 'Description', 'Food Type', 'Price', 'Cost Price', 'Tax Rate (%)', 'Preparation Time (minutes)', 'Available', 'POS Available', 'Online Available', 'Variants', 'Add-ons'],
        ...exportedItems.map((item) => [
          item.branchName,
          item.name,
          item.sku,
          item.categoryName || '',
          item.description || '',
          item.foodType,
          Number(item.price) || 0,
          Number(item.costPrice) || 0,
          Number(item.taxRate) || 0,
          Number(item.preparationTimeMinutes) || 0,
          item.isAvailable ? 'Yes' : 'No',
          item.isAvailablePOS ? 'Yes' : 'No',
          item.isAvailableOnline ? 'Yes' : 'No',
          (item.variants || []).map((variant) => `${variant.name}: ${variant.price}`).join('; '),
          (item.addons || []).map((addon) => `${addon.name}: ${addon.price}`).join('; '),
        ]),
      ];
      const file = new Blob([createXlsxBuffer(rows)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `menu-items-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setExportNotice(`Exported ${exportedItems.length} menu items from ${branches.length} branches.`);
    } catch (requestError) {
      setExportError(requestError instanceof Error ? requestError.message : 'Unable to export menu items.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <UtensilsCrossed className="w-6 h-6 text-indigo-600" />
            <span>Menu Items</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage menu items, availability, recipe costing, and sales channels.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleExportMenu}
            disabled={exporting}
            className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2 text-xs font-bold text-emerald-700 shadow-sm transition-all hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-900 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
          >
            {exporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            <span>{exporting ? 'Exporting…' : 'Export to Excel'}</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenMenuItemModal(null)}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-indigo-600/20 transition-all hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" />
            <span>Add Menu</span>
          </button>
        </div>
      </div>

      {(exportNotice || exportError) && (
        <p role={exportError ? 'alert' : 'status'} className={`rounded-xl border p-3 text-xs font-medium ${exportError ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>
          {exportError || exportNotice}
        </p>
      )}

      {/* Search & Food Type Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search dish title or SKU..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={selectedFoodType}
            onChange={(e) => setSelectedFoodType(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Food Types</option>
            <option value="VEG">🟢 Vegetarian</option>
            <option value="NON_VEG">🔴 Non-Vegetarian</option>
            <option value="VEGAN">🌱 Vegan</option>
            <option value="BEVERAGE">🥤 Beverage</option>
          </select>
        </div>
      </div>

      {/* Menu Items Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredItems.map((item) => {
          const grossProfit = Math.max(0, item.price - item.costPrice);
          const marginPercent = item.price > 0 ? Math.round((grossProfit / item.price) * 100) : 0;

          return (
            <div
              key={item._id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-all"
            >
              <div>
                {/* Image & Badges */}
                <div className="relative h-36 w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <img
                    src={
                      item.imageUrl ||
                      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=250&fit=crop'
                    }
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md backdrop-blur-md text-white shadow-xs ${item.foodType === 'VEG'
                        ? 'bg-emerald-600/90'
                        : item.foodType === 'NON_VEG'
                          ? 'bg-rose-600/90'
                          : item.foodType === 'VEGAN'
                            ? 'bg-teal-600/90'
                            : 'bg-sky-600/90'
                        }`}
                    >
                      {item.foodType}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-900/80 backdrop-blur-md text-white font-bold">
                      {item.sku}
                    </span>
                  </div>

                  <div className="absolute top-2.5 right-2.5">
                    <button
                      type="button"
                      onClick={() => toggleItemAvailability(item)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold shadow-xs backdrop-blur-md ${item.isAvailable
                        ? 'bg-emerald-500/90 text-white'
                        : 'bg-rose-500/90 text-white'
                        }`}
                    >
                      {item.isAvailable ? 'In Stock' : 'Unavailable'}
                    </button>
                  </div>
                </div>

                {/* Body Content */}
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {item.name}
                      </h3>
                      <span className="text-[10px] text-slate-400 font-semibold block">
                        {item.categoryName}
                      </span>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-base font-black text-slate-900 dark:text-white font-mono">
                        ₹{item.price}
                      </span>
                      <span className="text-[10px] text-emerald-600 font-bold block">
                        {marginPercent}% Margin
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                    {item.description || 'Delectable recipe prepared fresh to order.'}
                  </p>

                  <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-800">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {item.preparationTimeMinutes} mins prep
                    </span>
                    <span>Cost: ₹{item.costPrice}</span>
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                  <span>Channels:</span>
                  <span className={item.isAvailablePOS ? 'text-indigo-600 font-bold' : 'line-through text-slate-400'}>
                    POS
                  </span>
                  <span>•</span>
                  <span className={item.isAvailableOnline ? 'text-indigo-600 font-bold' : 'line-through text-slate-400'}>
                    Online
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onOpenMenuItemModal(item)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors"
                    title="Edit Item"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setItemToDelete(item)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                    title="Remove Item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredItems.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">
          No menu items match the selected filters.
        </p>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Menu Item"
        message={`Are you sure you want to permanently delete "${itemToDelete?.name}" (${itemToDelete?.sku}) from the catalog?`}
        confirmText="Yes, Delete Dish"
        variant="danger"
      />

    </div>
  );
};

export default MenuPage;
