import React, { useState, useEffect } from 'react';
import {
  UtensilsCrossed,
  Plus,
  Trash2,
  DollarSign,
  Clock,
  Layers,
  Building2,
  Flame,
  ImagePlus,
  Search,
  ChevronDown,
} from 'lucide-react';
import Modal from '../common/Modal.tsx';
import { useAppStore } from '../../store/AppStore.tsx';
import { useAccess } from '../../context/AccessContext.jsx';
import api from '../../services/api.js';
import { listBranchesRequest, listRestaurantsRequest } from '../../services/branch.api.js';
import {
  MenuItem,
  FoodType,
  MenuItemVariant,
  MenuItemAddon,
} from '../../types/index.ts';

const MAX_MENU_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

interface RestaurantOption {
  id: string;
  name: string;
  branches: Array<{ id: string; name: string; city?: string }>;
}

interface BranchOption {
  id: string;
  name: string;
  city?: string;
  restaurantId?: string;
  setupStatus?: string;
}

interface MenuItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemToEdit?: MenuItem | null;
}

interface SearchableOption {
  id: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  options: SearchableOption[];
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  options,
  placeholder,
  disabled = false,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = options.find((option) => option.id === value);
  const filteredOptions = options.filter((option) => (
    option.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  ));

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => {
          setSearch('');
          setIsOpen((open) => !open);
        }}
        className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-700 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
      >
        <span className={selected ? '' : 'text-slate-400'}>{selected?.label || placeholder}</span>
        <ChevronDown className="h-4 w-4 shrink-0" />
      </button>
      {isOpen && !disabled && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 p-2 dark:border-slate-800">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="search"
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search..."
                aria-label={`Search ${placeholder.toLowerCase()}`}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-xs outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>
          <ul role="listbox" className="max-h-52 overflow-y-auto p-1">
            {filteredOptions.length ? filteredOptions.map((option) => (
              <li key={option.id} role="option" aria-selected={option.id === value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option.id);
                    setSearch('');
                    setIsOpen(false);
                  }}
                  className={`w-full rounded-lg px-2.5 py-2 text-left text-xs hover:bg-indigo-50 dark:hover:bg-slate-800 ${option.id === value ? 'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200'}`}
                >
                  {option.label}
                </button>
              </li>
            )) : (
              <li className="px-2.5 py-3 text-xs text-slate-500">No matching options.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export const MenuItemModal: React.FC<MenuItemModalProps> = ({
  isOpen,
  onClose,
  itemToEdit,
}) => {
  const { categories, activeBranchId, addMenuItem, updateMenuItem } = useAppStore();
  const access = useAccess();

  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [allBranches, setAllBranches] = useState<BranchOption[]>([]);
  const [restaurantLoading, setRestaurantLoading] = useState(false);
  const [restaurantId, setRestaurantId] = useState('');
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [branchSearch, setBranchSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState(250);
  const [costPrice, setCostPrice] = useState(85);
  const [taxRate, setTaxRate] = useState(0);
  const [foodType, setFoodType] = useState<FoodType>('VEG');
  const [preparationTimeMinutes, setPrepTime] = useState(15);
  const [calories, setCalories] = useState<number>(350);
  const [isAvailable, setIsAvailable] = useState(true);
  const [isAvailablePOS, setIsAvailablePOS] = useState(true);
  const [isAvailableOnline, setIsAvailableOnline] = useState(true);
  const [variants, setVariants] = useState<MenuItemVariant[]>([]);
  const [addons, setAddons] = useState<MenuItemAddon[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const [imageName, setImageName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isBranchManageable = (branchId: string) => {
    const branchAccess = access.branches.find((entry: { id: string }) => entry.id === branchId);
    return access.isCompanySuperAdmin
      || access.companyPermissions.includes('menu.manage')
      || Boolean(branchAccess?.permissions.includes('menu.manage'));
  };
  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === restaurantId) || null;
  const restaurantBranches = allBranches.filter((branch) => (
    branch.setupStatus !== 'archived'
    && selectedRestaurant?.branches.some((restaurantBranch) => restaurantBranch.id === branch.id)
    && isBranchManageable(branch.id)
  ));
  const restaurantCategories = categories.filter((category) => (
    category.status !== 'INACTIVE'
    && selectedRestaurant?.branches.some((branch) => branch.id === category.branchId)
  ));
  const visibleRestaurantBranches = restaurantBranches.filter((branch) => (
    `${branch.name} ${branch.city || ''}`.toLocaleLowerCase().includes(branchSearch.trim().toLocaleLowerCase())
  ));
  const restaurantOptions = restaurants.map((restaurant) => ({ id: restaurant.id, label: restaurant.name }));
  const categoryOptions = restaurantCategories.map((category) => ({
    id: category._id,
    label: `${category.name}${category.branchName ? ` · ${category.branchName}` : ''}`,
  }));
  const selectedCategory = categories.find((category) => category._id === categoryId) || null;
  const assignedBranchId = selectedCategory?.branchId || itemToEdit?.branchId || activeBranchId || '';
  const assignedRestaurant = restaurants.find((restaurant) => (
    restaurant.branches.some((branch) => branch.id === assignedBranchId)
  )) || null;

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setRestaurantLoading(true);
    Promise.all([
      listRestaurantsRequest(),
      listBranchesRequest({ limit: 100 }),
    ])
      .then(([restaurantRows, branchData]: [RestaurantOption[], { branches?: BranchOption[] }]) => {
        if (!cancelled) {
          setRestaurants(restaurantRows || []);
          setAllBranches(branchData?.branches || []);
        }
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : 'Unable to load restaurants.');
      })
      .finally(() => {
        if (!cancelled) setRestaurantLoading(false);
      });
    return () => { cancelled = true; };
  }, [isOpen]);

  useEffect(() => {
    if (itemToEdit) {
      const editRestaurant = restaurants.find((restaurant) => (
        restaurant.branches.some((branch) => branch.id === itemToEdit.branchId)
      ));
      setRestaurantId(editRestaurant?.id || '');
      setSelectedBranchIds(itemToEdit.branchId ? [itemToEdit.branchId] : []);
      setName(itemToEdit.name);
      setSku(itemToEdit.sku);
      setCategoryId(itemToEdit.categoryId);
      setDescription(itemToEdit.description);
      setPrice(itemToEdit.price);
      setCostPrice(itemToEdit.costPrice);
      setTaxRate(itemToEdit.taxRate ?? 0);
      setFoodType(itemToEdit.foodType);
      setPrepTime(itemToEdit.preparationTimeMinutes);
      setCalories(itemToEdit.calories || 300);
      setIsAvailable(itemToEdit.isAvailable);
      setIsAvailablePOS(itemToEdit.isAvailablePOS);
      setIsAvailableOnline(itemToEdit.isAvailableOnline);
      setVariants(itemToEdit.variants || []);
      setAddons(itemToEdit.addons || []);
      setImageUrl(itemToEdit.imageUrl || '');
      setImageName(itemToEdit.imageUrl?.startsWith('data:') ? 'Current uploaded image' : '');
    } else {
      const activeBranchRestaurant = restaurants.find((restaurant) => (
        restaurant.branches.some((branch) => branch.id === activeBranchId && isBranchManageable(branch.id))
      ));
      const initialRestaurant = activeBranchRestaurant || restaurants.find((restaurant) => (
        restaurant.branches.some((branch) => isBranchManageable(branch.id))
      ));
      setRestaurantId(initialRestaurant?.id || '');
      const initialBranch = restaurantBranches.find((branch) => branch.id === activeBranchId)
        || restaurantBranches[0];
      setSelectedBranchIds(initialBranch ? [initialBranch.id] : []);
      setName('');
      setSku(`SKU-${Math.floor(1000 + Math.random() * 9000)}`);
      const initialCategory = categories.find((category) => category.branchId === initialBranch?.id)
        || categories.find((category) => initialRestaurant?.branches.some((branch) => branch.id === category.branchId && isBranchManageable(branch.id)));
      setCategoryId(initialCategory?._id || '');
      setDescription('');
      setPrice(250);
      setCostPrice(80);
      setTaxRate(0);
      const firstCategoryFoodType = categories[0]?.foodType;
      setFoodType(
        firstCategoryFoodType && firstCategoryFoodType !== 'MIXED'
          ? firstCategoryFoodType
          : 'VEG'
      );
      setPrepTime(15);
      setCalories(350);
      setIsAvailable(true);
      setIsAvailablePOS(true);
      setIsAvailableOnline(true);
      setVariants([]);
      setAddons([]);
      setImageUrl('');
      setImageName('');
    }
    setError(null);
  }, [itemToEdit, isOpen, categories, restaurants, activeBranchId, allBranches]);

  const addVariantRow = () => {
    setVariants((prev) => [...prev, { name: '', price: price }]);
  };

  const updateVariant = (index: number, field: 'name' | 'price', val: string | number) => {
    setVariants((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  const removeVariantRow = (index: number) => {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  };

  const addAddonRow = () => {
    setAddons((prev) => [...prev, { name: '', price: 30 }]);
  };

  const updateAddon = (index: number, field: 'name' | 'price', val: string | number) => {
    setAddons((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  const removeAddonRow = (index: number) => {
    setAddons((prev) => prev.filter((_, i) => i !== index));
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPG, PNG, or WebP image.');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_MENU_IMAGE_SIZE_BYTES) {
      setError('Menu item images must be 5 MB or smaller.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string' || !reader.result.startsWith(`data:${file.type};base64,`)) {
        setError('The selected image could not be read. Please try another file.');
        return;
      }
      setImageUrl(reader.result);
      setImageName(file.name);
      setError(null);
    };
    reader.onerror = () => setError('The selected image could not be read. Please try another file.');
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const removeImage = () => {
    setImageUrl('');
    setImageName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !restaurantId || !categoryId || selectedBranchIds.length === 0) {
      setError('Choose an item name, restaurant, category, and at least one branch.');
      return;
    }

    const categoryName = selectedCategory ? selectedCategory.name : 'General';
    const branchId = selectedCategory?.branchId || itemToEdit?.branchId || activeBranchId;
    if (!branchId && itemToEdit) {
      setError('The selected category is not assigned to a restaurant. Choose a restaurant category first.');
      return;
    }
    if (selectedCategory && !selectedCategory.branchId) {
      setError('The selected category is missing its restaurant assignment. Refresh the page and try again.');
      return;
    }
    try {
      setSaving(true);
      const payload = {
        name, sku, categoryId, description, price: Number(price), costPrice: Number(costPrice), taxRate: Number(taxRate), foodType,
        preparationTime: Number(preparationTimeMinutes), availability: isAvailable, onlineAvailability: isAvailableOnline, posAvailability: isAvailablePOS,
        branchId, variants, addOns: addons, image: imageUrl,
      };
      if (itemToEdit) {
        const response = await api.put(`/menu/items/${itemToEdit._id}`, payload);
        const saved = response.data?.data || response.data;
        const normalizedItem = { ...saved, categoryName, categoryId, branchAvailability: [String(branchId)], imageUrl: saved.image || imageUrl, preparationTimeMinutes: saved.preparationTime || preparationTimeMinutes, isAvailable: saved.availability ?? isAvailable, isAvailableOnline: saved.onlineAvailability ?? isAvailableOnline, isAvailablePOS: saved.posAvailability ?? isAvailablePOS, addons: saved.addOns || addons } as MenuItem;
        updateMenuItem(itemToEdit._id, normalizedItem);
      } else {
        const response = await api.post('/menu/items/bulk', { ...payload, restaurantId, branchIds: selectedBranchIds });
        const savedItems = response.data?.data || [];
        for (const saved of savedItems) {
          const savedBranchId = String(saved.branchId);
          const savedCategory = categories.find((category) => category._id === String(saved.categoryId));
          addMenuItem({
            ...saved,
            categoryName: savedCategory?.name || categoryName,
            categoryId: String(saved.categoryId),
            branchAvailability: [savedBranchId],
            imageUrl: saved.image || imageUrl,
            preparationTimeMinutes: saved.preparationTime || preparationTimeMinutes,
            isAvailable: saved.availability ?? isAvailable,
            isAvailableOnline: saved.onlineAvailability ?? isAvailableOnline,
            isAvailablePOS: saved.posAvailability ?? isAvailablePOS,
            addons: saved.addOns || addons,
          } as MenuItem);
        }
      }
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save menu item.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={itemToEdit ? `Edit Menu Item: ${itemToEdit.name}` : 'Create New Menu Item'}
      maxWidth="max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-600 dark:text-rose-300 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Name and SKU */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Item Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Butter Chicken"
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              SKU Code *
            </label>
            <input
              type="text"
              required
              value={sku}
              onChange={(e) => setSku(e.target.value.toUpperCase())}
              placeholder="SKU-1001"
              className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Restaurant *</label>
            <SearchableSelect
              value={restaurantId}
              options={restaurantOptions}
              placeholder={restaurantLoading ? 'Loading restaurants…' : 'Choose a restaurant'}
              disabled={Boolean(itemToEdit) || restaurantLoading}
              onChange={(nextRestaurantId) => {
                const nextRestaurant = restaurants.find((restaurant) => restaurant.id === nextRestaurantId);
                const nextRestaurantBranches = allBranches.filter((branch) => (
                  branch.setupStatus !== 'archived'
                  && nextRestaurant?.branches.some((restaurantBranch) => restaurantBranch.id === branch.id)
                  && isBranchManageable(branch.id)
                ));
                const firstBranch = nextRestaurantBranches.find((branch) => branch.id === activeBranchId)
                  || nextRestaurantBranches[0];
                const firstCategory = categories.find((category) => category.branchId === firstBranch?.id)
                  || categories.find((category) => nextRestaurant?.branches.some((branch) => branch.id === category.branchId && isBranchManageable(branch.id)));
                setRestaurantId(nextRestaurantId);
                setSelectedBranchIds(firstBranch ? [firstBranch.id] : []);
                setCategoryId(firstCategory?._id || '');
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Category *</label>
            <SearchableSelect
              value={categoryId}
              options={categoryOptions}
              placeholder={restaurantCategories.length ? 'Choose a category' : 'No categories for this restaurant'}
              disabled={restaurantCategories.length === 0 || Boolean(itemToEdit)}
              onChange={(nextCategoryId) => {
                setCategoryId(nextCategoryId);
                const nextCategory = restaurantCategories.find((category) => category._id === nextCategoryId);
                if (nextCategory?.foodType && nextCategory.foodType !== 'MIXED') setFoodType(nextCategory.foodType);
              }}
            />
          </div>
        </div>

        {!itemToEdit && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                <Building2 className="h-3.5 w-3.5 text-indigo-600" /> Assign to branches *
              </label>
              <span className="text-[10px] text-slate-500">{selectedBranchIds.length} selected</span>
            </div>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="search"
                value={branchSearch}
                onChange={(event) => setBranchSearch(event.target.value)}
                placeholder="Search branches by name or city..."
                aria-label="Search branches"
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {visibleRestaurantBranches.map((branch) => (
                <label key={branch.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">
                  <input
                    type="checkbox"
                    checked={selectedBranchIds.includes(branch.id)}
                    onChange={(event) => setSelectedBranchIds((current) => (
                      event.target.checked
                        ? [...current, branch.id]
                        : current.filter((id) => id !== branch.id)
                    ))}
                    className="h-4 w-4 rounded text-indigo-600"
                  />
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-700 dark:text-slate-200">{branch.name}</span>
                  {branch.city && <span className="text-[10px] text-slate-500">{branch.city}</span>}
                </label>
              ))}
              {visibleRestaurantBranches.length === 0 && restaurantBranches.length > 0 && (
                <p className="col-span-full px-1 py-2 text-xs text-slate-500">No branches match your search.</p>
              )}
            </div>
            <p className="mt-2 text-[10px] leading-4 text-slate-500">
              Matching categories are reused. If a selected branch is missing this category, it is created there using the selected category’s settings.
            </p>
            {restaurantBranches.length === 0 && (
              <p className="mt-2 text-[10px] font-medium text-amber-600">No active branches with menu-management access are available.</p>
            )}
          </div>
        )}

        {/* Pricing, Cost & Taxes */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Selling Price (₹) *
            </label>
            <div className="relative">
              <span className="text-slate-400 absolute left-3 top-2 text-xs">₹</span>
              <input
                type="number"
                required
                min={0}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full pl-7 pr-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Cost Price (₹)
            </label>
            <div className="relative">
              <span className="text-slate-400 absolute left-3 top-2 text-xs">₹</span>
              <input
                type="number"
                min={0}
                value={costPrice}
                onChange={(e) => setCostPrice(Number(e.target.value))}
                className="w-full pl-7 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tax Rate (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={taxRate}
              onChange={(e) => setTaxRate(Number(e.target.value))}
              className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <p className="mt-1 text-[10px] leading-4 text-slate-500">Enter the tax rate confirmed for this item. New items default to 0%; no GST rate is assumed.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Food Type
            </label>
            <select
              value={foodType}
              onChange={(e) => setFoodType(e.target.value as FoodType)}
              className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="VEG">🟢 Veg</option>
              <option value="NON_VEG">🔴 Non-Veg</option>
              <option value="VEGAN">🌱 Vegan</option>
              <option value="BEVERAGE">🥤 Beverage</option>
            </select>
          </div>
        </div>

        {/* Prep Time, Description, and Image */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Prep Time (mins)
            </label>
            <div className="relative">
              <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="number"
                value={preparationTimeMinutes}
                onChange={(e) => setPrepTime(Number(e.target.value))}
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Menu Item Image</span>
            {imageUrl && (
              <div className="mb-2 flex items-center gap-3 rounded-xl border border-slate-200 p-2 dark:border-slate-700">
                <img src={imageUrl} alt={`${name || 'Menu item'} preview`} className="h-16 w-20 rounded-lg bg-slate-100 object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{imageName || 'Image preview'}</p>
                  <button type="button" onClick={removeImage} className="mt-1 text-xs font-semibold text-rose-600 hover:text-rose-700">Remove image</button>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/70">
                <ImagePlus className="h-4 w-4" />
                Upload image
                <input type="file" accept=".jpeg,image/jpeg,image/png,image/webp" onChange={handleImageChange} className="sr-only" />
              </label>
              <input
                type="url"
                value={imageUrl.startsWith('data:') ? '' : imageUrl}
                onChange={(e) => { setImageUrl(e.target.value); setImageName(''); }}
                placeholder="Or paste an image URL"
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <p className="mt-1 text-[10px] text-slate-500">JPG, PNG, or WebP · up to 5 MB</p>
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Delightful recipe description with spices and garnishes..."
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {itemToEdit && <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-slate-50/50 dark:bg-slate-900/50 space-y-2">
          <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
            <span className="mb-1.5 flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-indigo-600" /> Restaurant</span>
            <input
              readOnly
              value={assignedRestaurant?.name || selectedCategory?.branchName || (assignedBranchId ? 'Restaurant assigned from category' : 'Select a category first')}
              className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            />
            <span className="mt-1.5 block text-[10px] font-normal text-slate-500">Restaurant and branch assignment cannot be changed while editing an item.</span>
          </label>
        </div>}

        {/* Availability Channels */}
        <div className="flex flex-wrap gap-4 pt-2">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={isAvailable}
              onChange={(e) => setIsAvailable(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded"
            />
            <span>Active Item</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={isAvailablePOS}
              onChange={(e) => setIsAvailablePOS(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded"
            />
            <span>Show on POS Terminal</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={isAvailableOnline}
              onChange={(e) => setIsAvailableOnline(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded"
            />
            <span>Enable for Online Ordering</span>
          </label>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm shadow-indigo-600/20 transition-colors"
          >
            {saving ? 'Saving…' : itemToEdit ? 'Save Changes' : 'Create Menu Item'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default MenuItemModal;
