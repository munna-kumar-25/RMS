import React, { useState, useMemo, useEffect } from 'react';
import {
  Boxes,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Utensils,
  Pencil,
} from 'lucide-react';
import { useAppStore } from '../../store/AppStore.tsx';
import { InventoryItem, MenuItem } from '../../types/index.ts';
import StatusBadge from '../../components/common/StatusBadge.tsx';
import Modal from '../../components/common/Modal.tsx';
import api from '../../services/api.js';
import { getMaterialStockStatus, getMenuItemStockStatus, isMenuItemStockConfigured } from '../../utils/inventoryStatus.js';

export const InventoryPage: React.FC = () => {
  const {
    inventoryItems,
    branches,
    activeBranchId,
    suppliers,
    menuItems,
    setMenuItems,
    updateMenuItem,
    setInventoryItems,
    updateInventory,
  } = useAppStore();

  const [inventoryTab, setInventoryTab] = useState<'MATERIALS' | 'MENU_ITEMS'>('MATERIALS');
  const [showAddInventory, setShowAddInventory] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<InventoryItem | null>(null);
  const [inventoryType, setInventoryType] = useState<'MATERIAL' | 'MENU_ITEM'>('MATERIAL');
  const [inventoryName, setInventoryName] = useState('');
  const [inventorySku, setInventorySku] = useState('');
  const [inventoryCategory, setInventoryCategory] = useState<InventoryItem['category']>('GROCERY');
  const [inventoryUnit, setInventoryUnit] = useState<InventoryItem['unit']>('PIECES');
  const [inventoryBranchId, setInventoryBranchId] = useState(activeBranchId || branches[0]?._id || '');
  const [openingStock, setOpeningStock] = useState(0);
  const [minimumStock, setMinimumStock] = useState(0);
  const [maximumStock, setMaximumStock] = useState(0);
  const [reorderLevel, setReorderLevel] = useState(0);
  const [unitCost, setUnitCost] = useState(0);
  const [supplierId, setSupplierId] = useState('');
  const [expiryTracking, setExpiryTracking] = useState(false);
  const [selectedMenuItemId, setSelectedMenuItemId] = useState('');
  const [trackMenuStock, setTrackMenuStock] = useState(true);
  const [savingInventory, setSavingInventory] = useState(false);
  const [inventoryError, setInventoryError] = useState('');
  const [menuItemsLoading, setMenuItemsLoading] = useState(false);
  const [menuItemsLoadError, setMenuItemsLoadError] = useState('');
  const [menuItemsRefreshKey, setMenuItemsRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [restockItem, setRestockItem] = useState<InventoryItem | null>(null);
  const [restockQuantity, setRestockQuantity] = useState<number>(20);
  const [restockError, setRestockError] = useState('');
  const [savingRestock, setSavingRestock] = useState(false);
  const [locations, setLocations] = useState<{ _id: string; name: string; isActive: boolean; isDefault: boolean }[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadMenuItems = async () => {
      if (!activeBranchId || menuItemsRefreshKey === 0) return;
      const branch = branches.find((entry) => entry._id === activeBranchId);
      if (!branch) return;
      setMenuItemsLoading(true);
      setMenuItemsLoadError('');
      try {
        const items: any[] = [];
        let page = 1;
        let pages = 1;
        do {
          const response = await api.get('/menu/items', {
            params: { branchId: branch._id, limit: 100, page },
          });
          const data = response.data?.data;
          if (!Array.isArray(data?.items)) throw new Error(`The menu items for ${branch.name} could not be loaded.`);
          items.push(...data.items);
          pages = Math.max(1, Number(data.pagination?.pages) || 1);
          page += 1;
        } while (page <= pages);
        const rows = items.map((item) => {
          const itemBranchId = String(item.branchId?._id || item.branchId || branch._id);
          return {
            ...item,
            _id: String(item._id),
            branchId: itemBranchId,
            branchName: branch.name,
            categoryId: String(item.categoryId?._id || item.categoryId),
            categoryName: item.categoryId?.name || item.categoryName || 'Uncategorised',
            branchAvailability: [itemBranchId],
            isAvailable: Boolean(item.availability),
            isAvailablePOS: Boolean(item.posAvailability),
            isAvailableOnline: Boolean(item.onlineAvailability),
            preparationTimeMinutes: item.preparationTime || 0,
            imageUrl: item.image || '',
            addons: item.addOns || [],
          };
        });
        if (!cancelled) {
          setMenuItems((current) => [
            ...current.filter((item) => String(item.branchId || item.branchAvailability?.[0] || '') !== branch._id),
            ...rows,
          ]);
        }
      } catch (requestError) {
        if (!cancelled) setMenuItemsLoadError(requestError instanceof Error ? requestError.message : 'Unable to refresh menu item stock.');
      } finally {
        if (!cancelled) setMenuItemsLoading(false);
      }
    };
    loadMenuItems();
    return () => { cancelled = true; };
  }, [activeBranchId, branches, menuItemsRefreshKey, setMenuItems]);

  useEffect(() => {
    if (!restockItem) return;
    api.get('/inventory/locations', { params: { branchId: restockItem.branchId } })
      .then((response) => {
        const nextLocations = (response.data?.data || []).filter((location: { isActive: boolean }) => location.isActive);
        setLocations(nextLocations);
        setSelectedLocationId(nextLocations.find((location: { isDefault: boolean }) => location.isDefault)?._id || nextLocations[0]?._id || '');
      })
      .catch((requestError) => {
        setRestockError(requestError instanceof Error ? requestError.message : 'Unable to load inventory locations.');
      });
  }, [restockItem?._id]);

  const scopedItems = useMemo(() => {
    return inventoryItems.filter((item) => {
      const matchBranch = !activeBranchId || item.branchId === activeBranchId;
      const matchCategory =
        selectedCategory === 'ALL' || item.category === selectedCategory;
      const matchSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchQuery.toLowerCase());

      return matchBranch && matchCategory && matchSearch;
    });
  }, [inventoryItems, activeBranchId, selectedCategory, searchQuery]);
  const filteredItems = useMemo(
    () => scopedItems.filter((item) => selectedStatus === 'ALL' || getMaterialStockStatus(item) === selectedStatus),
    [scopedItems, selectedStatus]
  );

  const scopedMenuItems = useMemo(() => menuItems.filter((item) => {
    const itemBranchId = item.branchId || item.branchAvailability?.[0] || '';
    const matchBranch = !activeBranchId || itemBranchId === activeBranchId;
    const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase())
      || item.sku.toLowerCase().includes(searchQuery.toLowerCase());
    return matchBranch && matchSearch;
  }), [menuItems, activeBranchId, searchQuery]);
  const filteredMenuItems = useMemo(
    () => scopedMenuItems.filter((item) => selectedStatus === 'ALL' || getMenuItemStockStatus(item) === selectedStatus),
    [scopedMenuItems, selectedStatus]
  );

  // Aggregate Metrics
  const totalItems = inventoryTab === 'MATERIALS' ? filteredItems.length : filteredMenuItems.length;
  const lowStockCount = inventoryTab === 'MATERIALS'
    ? scopedItems.filter((item) => getMaterialStockStatus(item) === 'LOW_STOCK').length
    : scopedMenuItems.filter((item) => getMenuItemStockStatus(item) === 'LOW_STOCK').length;
  const outOfStockCount = inventoryTab === 'MATERIALS'
    ? scopedItems.filter((item) => getMaterialStockStatus(item) === 'OUT_OF_STOCK').length
    : scopedMenuItems.filter((item) => getMenuItemStockStatus(item) === 'OUT_OF_STOCK').length;
  const totalValuation = inventoryTab === 'MATERIALS'
    ? filteredItems.filter((item) => item.lifecycleStatus !== 'DRAFT').reduce((sum, i) => sum + i.currentStock * i.unitCost, 0)
    : 0;
  const untrackedMenuItemCount = menuItems.filter((item) => {
    const itemBranchId = item.branchId || item.branchAvailability?.[0] || '';
    return (!activeBranchId || itemBranchId === activeBranchId) && !isMenuItemStockConfigured(item);
  }).length;
  const resetInventoryForm = () => {
    setShowAddInventory(false);
    setEditingMaterial(null);
    setInventoryType('MATERIAL');
    setInventoryName('');
    setInventorySku('');
    setInventoryCategory('GROCERY');
    setInventoryUnit('PIECES');
    setInventoryBranchId(activeBranchId || branches[0]?._id || '');
    setOpeningStock(0);
    setMinimumStock(0);
    setMaximumStock(0);
    setReorderLevel(0);
    setUnitCost(0);
    setSupplierId('');
    setExpiryTracking(false);
    setSelectedMenuItemId('');
    setTrackMenuStock(true);
    setInventoryError('');
  };

  const openInventoryForm = (item?: MenuItem) => {
    setEditingMaterial(null);
    setInventoryType(item ? 'MENU_ITEM' : inventoryTab === 'MENU_ITEMS' ? 'MENU_ITEM' : 'MATERIAL');
    setInventoryName('');
    setInventorySku('');
    setInventoryBranchId(item?.branchId || activeBranchId || branches[0]?._id || '');
    setOpeningStock(item?.stockQuantity || 0);
    setMinimumStock(item?.minimumStockQuantity || 0);
    setMaximumStock(0);
    setReorderLevel(0);
    setUnitCost(0);
    setSupplierId('');
    setExpiryTracking(false);
    setSelectedMenuItemId(item?._id || '');
    setTrackMenuStock(item ? isMenuItemStockConfigured(item) : true);
    setInventoryError('');
    setShowAddInventory(true);
  };

  const openMaterialForm = (item?: InventoryItem) => {
    setEditingMaterial(item || null);
    setInventoryType('MATERIAL');
    setInventoryName(item?.name || '');
    setInventorySku(item?.sku || '');
    setInventoryCategory(item?.category || 'GROCERY');
    setInventoryUnit(item?.unit || 'PIECES');
    setInventoryBranchId(item?.branchId || activeBranchId || branches[0]?._id || '');
    setOpeningStock(item?.lifecycleStatus === 'DRAFT' ? item.draftOpeningStock || 0 : item?.currentStock || 0);
    setMinimumStock(item?.minimumStock || 0);
    setMaximumStock(item?.maximumStock || 0);
    setReorderLevel(item?.reorderLevel || 0);
    setUnitCost(item?.unitCost || 0);
    setSupplierId(item?.supplierId || '');
    setExpiryTracking(Boolean(item?.expiryTracking));
    setSelectedMenuItemId('');
    setTrackMenuStock(true);
    setInventoryError('');
    setShowAddInventory(true);
  };

  const handleCreateInventory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const action = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const saveAsDraft = action?.value === 'DRAFT';
    const activateDraft = action?.value === 'ACTIVATE';
    setInventoryError('');
    setSavingInventory(true);
    try {
      if (inventoryType === 'MENU_ITEM') {
        const item = menuItems.find((entry) => entry._id === selectedMenuItemId);
        if (!item) throw new Error('Select a menu item to configure its stock.');
        const response = await api.put(`/inventory/menu-items/${item._id}/stock`, {
          stockTracked: trackMenuStock,
          stockQuantity: Math.max(0, Math.trunc(openingStock)),
          minimumStockQuantity: Math.max(0, Math.trunc(minimumStock)),
        });
        const saved = response.data?.data || response.data;
        updateMenuItem(item._id, {
          stockTracked: saved.stockTracked,
          stockQuantity: saved.stockQuantity,
          minimumStockQuantity: saved.minimumStockQuantity,
        });
        setInventoryTab('MENU_ITEMS');
      } else {
        if (!inventoryBranchId) throw new Error('Select a branch for this raw material.');
        if (!inventoryName.trim() || !inventorySku.trim()) throw new Error('Enter a material name and SKU.');
        const configuration = {
          name: inventoryName.trim(),
          sku: inventorySku.trim(),
          category: inventoryCategory,
          unit: inventoryUnit,
          minimumStock: Math.max(0, minimumStock),
          maximumStock: Math.max(0, maximumStock),
          reorderLevel: Math.max(0, reorderLevel),
          costPerUnit: Math.max(0, unitCost),
          supplierId: supplierId.trim() || null,
          expiryTracking,
        };
        let response;
        if (editingMaterial) {
          if (activateDraft) {
            await api.put(`/inventory/${editingMaterial._id}`, {
              ...configuration,
              draftOpeningStock: Math.max(0, openingStock),
            });
            response = await api.post(`/inventory/${editingMaterial._id}/activate`);
          } else {
            response = await api.put(`/inventory/${editingMaterial._id}`, {
              ...configuration,
              ...(editingMaterial.lifecycleStatus === 'DRAFT' ? { draftOpeningStock: Math.max(0, openingStock) } : {}),
            });
          }
        } else {
          response = await api.post('/inventory', {
            branchId: inventoryBranchId,
            ...configuration,
            currentStock: Math.max(0, openingStock),
            saveAsDraft,
          });
        }
        const result = response.data?.data || response.data;
        const saved = result.item || result;
        const normalized = {
          ...saved,
          _id: String(saved._id),
          branchId: String(saved.branchId || inventoryBranchId),
          branchName: branches.find((branch) => branch._id === inventoryBranchId)?.name || '',
          unitCost: saved.costPerUnit ?? unitCost,
        };
        if (editingMaterial) updateInventory(editingMaterial._id, normalized);
        else setInventoryItems([...inventoryItems, normalized]);
        setInventoryTab('MATERIALS');
      }
      resetInventoryForm();
    } catch (requestError) {
      setInventoryError(requestError instanceof Error ? requestError.message : 'Unable to save inventory.');
    } finally {
      setSavingInventory(false);
    }
  };

  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (restockItem && restockQuantity > 0) {
      setRestockError('');
      setSavingRestock(true);
      try {
        const response = await api.post('/inventory/stock-in', {
          branchId: restockItem.branchId,
          ingredientId: restockItem._id,
          ...(selectedLocationId ? { locationId: selectedLocationId } : {}),
          quantity: restockQuantity,
          reason: 'Manual restock from inventory console',
        });
        const result = response.data?.data || response.data;
        const savedItem = result.item || result;
        updateInventory(restockItem._id, {
          ...savedItem,
          currentStock: savedItem.currentStock,
          status: savedItem.status,
          unitCost: savedItem.unitCost ?? savedItem.costPerUnit ?? restockItem.unitCost,
        });
        setRestockItem(null);
        setRestockQuantity(20);
      } catch (requestError) {
        setRestockError(requestError instanceof Error ? requestError.message : 'Unable to receive stock.');
      } finally {
        setSavingRestock(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <Boxes className="w-6 h-6 text-indigo-600" />
            <span>Raw Materials & Inventory Management</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Track raw materials and menu-item availability with stock alerts and order-based deductions.
          </p>
        </div>
        <div className="flex gap-2">
          {inventoryTab === 'MENU_ITEMS' && activeBranchId && (
            <button type="button" onClick={() => setMenuItemsRefreshKey((key) => key + 1)} disabled={menuItemsLoading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800" title="Refresh menu item stock">
              <RefreshCw className={`h-3.5 w-3.5 ${menuItemsLoading ? 'animate-spin' : ''}`} /> Refresh stock
            </button>
          )}
          <button
            type="button"
            onClick={() => openInventoryForm()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" /> Add inventory
          </button>
        </div>
      </div>

      <div className="flex w-fit gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
        <button type="button" onClick={() => { setInventoryTab('MATERIALS'); setSelectedStatus('ALL'); }} className={`rounded-lg px-4 py-2 text-xs font-bold ${inventoryTab === 'MATERIALS' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
          Raw materials
        </button>
        <button type="button" onClick={() => { setInventoryTab('MENU_ITEMS'); setSelectedCategory('ALL'); setSelectedStatus('ALL'); }} className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold ${inventoryTab === 'MENU_ITEMS' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
          <Utensils className="h-3.5 w-3.5" /> Menu items
        </button>
      </div>

      {/* KPI Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Monitored SKUs
          </span>
          <span className="text-xl font-black text-slate-900 dark:text-white mt-1 block">
            {totalItems}
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Inventory Valuation
          </span>
          <span className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1 block">
            ₹{Math.round(totalValuation).toLocaleString()}
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Low Stock Warnings
          </span>
          <span className="text-xl font-black text-amber-500 mt-1 block">
            {lowStockCount}
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Critical Stockouts
          </span>
          <span className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1 block">
            {outOfStockCount}
          </span>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={inventoryTab === 'MATERIALS' ? 'Search material title or SKU...' : 'Search menu item or SKU...'}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          {inventoryTab === 'MATERIALS' && <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Categories</option>
            <option value="DAIRY">Dairy</option>
            <option value="MEAT">Meat & Poultry</option>
            <option value="PRODUCE">Fresh Produce</option>
            <option value="GROCERY">Grocery & Dry</option>
            <option value="SPICES">Spices & Seasoning</option>
            <option value="BEVERAGES">Beverages</option>
            <option value="PACKAGING">Packaging & Boxes</option>
          </select>}

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="IN_STOCK">In Stock</option>
            <option value="LOW_STOCK">Low Stock</option>
            <option value="OUT_OF_STOCK">Out of Stock</option>
            {inventoryTab === 'MATERIALS' && <option value="DRAFT">Draft</option>}
            {inventoryTab === 'MENU_ITEMS' && <option value="NOT_CONFIGURED">Configuration needed</option>}
          </select>
        </div>
      </div>

      {/* Inventory Items Table */}
      {inventoryTab === 'MENU_ITEMS' && menuItemsLoadError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          {menuItemsLoadError}
        </div>
      )}
      {inventoryTab === 'MENU_ITEMS' && menuItemsLoading && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading all menu items and stock…
        </div>
      )}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
              {inventoryTab === 'MATERIALS' ? (
                <tr>
                  <th className="py-3 px-4">Raw Material</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Branch Location</th>
                  <th className="py-3 px-4">Current Stock</th>
                  <th className="py-3 px-4">Threshold</th>
                  <th className="py-3 px-4">Unit Cost</th>
                  <th className="py-3 px-4">Total Value</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              ) : (
                <tr>
                  <th className="py-3 px-4">Menu Item</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Branch Location</th>
                  <th className="py-3 px-4">Current Stock</th>
                  <th className="py-3 px-4">Low-stock Alert</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {inventoryTab === 'MATERIALS' ? filteredItems.map((item) => (
                <tr key={item._id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4">
                    <span className="font-bold text-slate-900 dark:text-white block">
                      {item.name}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {item.sku}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-slate-600 dark:text-slate-300 font-medium">
                    {item.category}
                  </td>

                  <td className="py-3 px-4 text-slate-500">
                    {item.branchName || branches.find((branch) => branch._id === item.branchId)?.name || 'Branch'}
                  </td>

                  <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                    {item.currentStock} {item.unit}
                  </td>

                  <td className="py-3 px-4 font-mono text-slate-500">
                    {item.minimumStock} {item.unit}
                  </td>

                  <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                    ₹{item.unitCost}
                  </td>

                  <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                    ₹{Math.round((item.lifecycleStatus === 'DRAFT' ? 0 : item.currentStock) * item.unitCost).toLocaleString()}
                  </td>

                  <td className="py-3 px-4">
                    <StatusBadge status={getMaterialStockStatus(item)} />
                  </td>

                  <td className="py-3 px-4 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => openMaterialForm(item)} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                        <Pencil className="h-3 w-3" /> Update
                      </button>
                      {item.lifecycleStatus !== 'DRAFT' && (
                        <button
                          type="button"
                          onClick={() => { setRestockError(''); setRestockItem(item); }}
                          className="px-2.5 py-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 rounded-lg transition-colors"
                        >
                          + Stock In
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )) : filteredMenuItems.map((item) => {
                const itemBranchId = item.branchId || item.branchAvailability?.[0] || '';
                const status = getMenuItemStockStatus(item);
                return (
                  <tr key={item._id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4">
                      <span className="block font-bold text-slate-900 dark:text-white">{item.name}</span>
                      <span className="font-mono text-[10px] text-slate-400">{item.sku}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{item.categoryName || 'Uncategorised'}</td>
                    <td className="py-3 px-4 text-slate-500">                    {branches.find((branch) => branch._id === itemBranchId)?.name || item.branchName || 'Branch'}</td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                      {item.stockQuantity ?? 0} portions
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500">
                      {item.minimumStockQuantity ?? 0} portions
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={status === 'NOT_CONFIGURED' ? 'SETUP REQUIRED' : status} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button type="button" onClick={() => openInventoryForm(item)} className="rounded-lg bg-indigo-50 px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 transition hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300">
                        {isMenuItemStockConfigured(item) ? 'Configure / Adjust' : '+ Add inventory'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {((inventoryTab === 'MATERIALS' && filteredItems.length === 0) || (inventoryTab === 'MENU_ITEMS' && filteredMenuItems.length === 0)) && (
                <tr>
                  <td colSpan={inventoryTab === 'MATERIALS' ? 9 : 7} className="px-4 py-10 text-center text-xs text-slate-500">
                    {selectedStatus === 'LOW_STOCK' ? (
                      <div className="space-y-2">
                        <p>No tracked items have stock above zero and at or below their low-stock threshold.</p>
                        {inventoryTab === 'MENU_ITEMS' && untrackedMenuItemCount > 0 && (
                          <div className="space-y-2">
                            <p>{untrackedMenuItemCount} menu item(s) need stock tracking configured before low-stock alerts can be calculated.</p>
                            <button type="button" onClick={() => setSelectedStatus('NOT_CONFIGURED')} className="rounded-lg bg-indigo-50 px-3 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300">
                              Show items needing configuration
                            </button>
                          </div>
                        )}
                      </div>
                    ) : `No ${inventoryTab === 'MATERIALS' ? 'raw materials' : 'menu items'} match the selected filters.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={showAddInventory}
        onClose={() => { if (!savingInventory) resetInventoryForm(); }}
        title={inventoryType === 'MATERIAL' ? (editingMaterial ? 'Update raw material configuration' : 'Add raw material') : 'Configure menu item stock'}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleCreateInventory} className="space-y-5">
          {inventoryError && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              {inventoryError}
            </p>
          )}

          <div className="grid gap-4 rounded-2xl bg-indigo-50/70 p-4 dark:bg-indigo-950/30 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Inventory type
              <select
                value={inventoryType}
                disabled={Boolean(editingMaterial)}
                onChange={(event) => { setInventoryType(event.target.value as 'MATERIAL' | 'MENU_ITEM'); setInventoryError(''); }}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="MATERIAL">Raw material</option>
                <option value="MENU_ITEM">Menu item stock</option>
              </select>
            </label>
            {branches.length > 1 && (
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Branch
                <select
                  required
                  value={inventoryBranchId}
                  disabled={Boolean(editingMaterial)}
                  onChange={(event) => { setInventoryBranchId(event.target.value); setSelectedMenuItemId(''); }}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  {branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}
                </select>
              </label>
            )}
          </div>

          {inventoryType === 'MATERIAL' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Material name *
                  <input required maxLength={120} value={inventoryName} onChange={(event) => setInventoryName(event.target.value)} placeholder="e.g. Basmati rice" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
                </label>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  SKU *
                  <input required maxLength={60} value={inventorySku} onChange={(event) => setInventorySku(event.target.value.toUpperCase())} placeholder="e.g. RICE-001" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm uppercase dark:border-slate-700 dark:bg-slate-800" />
                </label>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Category
                  <select value={inventoryCategory} onChange={(event) => setInventoryCategory(event.target.value as InventoryItem['category'])} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800">
                    <option value="DAIRY">Dairy</option><option value="MEAT">Meat & poultry</option><option value="PRODUCE">Fresh produce</option><option value="GROCERY">Grocery & dry</option><option value="SPICES">Spices & seasoning</option><option value="BEVERAGES">Beverages</option><option value="PACKAGING">Packaging & boxes</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Stock unit
                  <select value={inventoryUnit} onChange={(event) => setInventoryUnit(event.target.value as InventoryItem['unit'])} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800">
                    <option value="KG">Kilograms</option><option value="GRAMS">Grams</option><option value="LITRES">Litres</option><option value="ML">Millilitres</option><option value="PIECES">Pieces</option><option value="PACKS">Packs</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {editingMaterial && editingMaterial.lifecycleStatus !== 'DRAFT' ? 'Current stock (use Stock In to change)' : 'Opening stock'}
                  <input type="number" min="0" step="0.01" disabled={Boolean(editingMaterial && editingMaterial.lifecycleStatus !== 'DRAFT')} value={openingStock} onChange={(event) => setOpeningStock(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800" />
                </label>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Low-stock threshold
                  <input type="number" min="0" step="0.01" value={minimumStock} onChange={(event) => setMinimumStock(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
                  {minimumStock === 0 && <span className="mt-1 block font-normal text-amber-600">Set a threshold above zero to receive low-stock warnings.</span>}
                </label>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Maximum stock
                  <input type="number" min="0" step="0.01" value={maximumStock} onChange={(event) => setMaximumStock(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
                </label>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Reorder level
                  <input type="number" min="0" step="0.01" value={reorderLevel} onChange={(event) => setReorderLevel(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
                </label>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Unit cost (₹)
                  <input type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
                </label>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Supplier <span className="font-normal text-slate-400">(optional)</span>
                  <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800">
                    <option value="">No supplier selected</option>
                    {suppliers.filter((supplier) => supplier.status === 'ACTIVE').map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.companyName || supplier.name}</option>)}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={expiryTracking} onChange={(event) => setExpiryTracking(event.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                Track expiry dates for this material
              </label>
            </>
          ) : (
            <div className="space-y-4">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Menu item *
                <select
                  required
                  value={selectedMenuItemId}
                  onChange={(event) => {
                    const item = menuItems.find((entry) => entry._id === event.target.value);
                    setSelectedMenuItemId(event.target.value);
                    if (item) {
                      setOpeningStock(item.stockQuantity || 0);
                      setMinimumStock(item.minimumStockQuantity || 0);
                      setTrackMenuStock(isMenuItemStockConfigured(item));
                    }
                  }}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="">Select a menu item</option>
                  {menuItems.filter((item) => (item.branchId || item.branchAvailability?.[0]) === inventoryBranchId).map((item) => (
                    <option key={item._id} value={item._id}>{item.name} · {item.sku}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={trackMenuStock} onChange={(event) => setTrackMenuStock(event.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                Automatically deduct stock when this item is ordered
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Current stock (portions)
                  <input type="number" min="0" step="1" value={openingStock} onChange={(event) => setOpeningStock(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
                </label>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Low-stock alert (portions)
                  <input type="number" min="0" step="1" value={minimumStock} onChange={(event) => setMinimumStock(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
                  {trackMenuStock && minimumStock === 0 && <span className="mt-1 block font-normal text-amber-600">Set a threshold above zero to receive low-stock warnings.</span>}
                </label>
              </div>
              <p className="rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-500 dark:bg-slate-800">
                Stock is counted in portions. Tracked menu-item stock decreases when an order is accepted and is returned if that order is cancelled.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button type="button" disabled={savingInventory} onClick={resetInventoryForm} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
            {inventoryType === 'MATERIAL' && (!editingMaterial || editingMaterial.lifecycleStatus === 'DRAFT') && (
              <button type="submit" value="DRAFT" disabled={savingInventory} className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-800 shadow-sm hover:bg-amber-100 disabled:opacity-50 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                Save Draft
              </button>
            )}
            <button type="submit" value={editingMaterial?.lifecycleStatus === 'DRAFT' ? 'ACTIVATE' : editingMaterial ? 'UPDATE' : 'SAVE'} disabled={savingInventory} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50">
              {savingInventory ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {savingInventory ? 'Saving…' : inventoryType === 'MENU_ITEM'
                ? 'Save stock settings'
                : editingMaterial?.lifecycleStatus === 'DRAFT'
                  ? 'Activate & Update'
                  : editingMaterial
                    ? 'Update Configuration'
                    : 'Add raw material'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Quick Restock Modal */}
      <Modal
        isOpen={!!restockItem}
        onClose={() => { if (!savingRestock) setRestockItem(null); }}
        title={`Receive Stock: ${restockItem?.name}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleRestockSubmit} className="space-y-4">
          {restockError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{restockError}</p>}
          <p className="text-xs text-slate-500">
            Current Stock: <strong className="text-slate-800 dark:text-white">{restockItem?.currentStock} {restockItem?.unit}</strong> at {restockItem?.branchName}.
          </p>

          {locations.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Receive into location</label>
              <select required value={selectedLocationId} onChange={(event) => setSelectedLocationId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800">
                {locations.map((location) => <option key={location._id} value={location._id}>{location.name}{location.isDefault ? ' (default)' : ''}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Quantity to Inward ({restockItem?.unit}) *
            </label>
            <input
              type="number"
              min={1}
              required
              value={restockQuantity}
              onChange={(e) => setRestockQuantity(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => { if (!savingRestock) setRestockItem(null); }}
              disabled={savingRestock}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingRestock}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm"
            >
              {savingRestock ? 'Saving…' : 'Confirm Stock Receipt'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default InventoryPage;
