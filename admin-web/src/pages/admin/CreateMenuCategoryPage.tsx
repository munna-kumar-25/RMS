import React, { useEffect, useMemo, useState } from 'react';
import { Check, Edit2, FolderPlus, ImagePlus, LoaderCircle, Plus, Save, Search, Send, Trash2 } from 'lucide-react';
import { useAppStore } from '../../store/AppStore.tsx';
import { useAccess } from '../../context/AccessContext.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import api from '../../services/api.js';
import ConfirmDialog from '../../components/common/ConfirmDialog.tsx';
import { listRestaurantsRequest } from '../../services/branch.api.js';
import { MenuCategory } from '../../types/index.ts';

interface CreateMenuCategoryPageProps {
  onNavigate: (path: string) => void;
}

const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white';
const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;
const FOOD_TYPE_LABELS: Record<NonNullable<MenuCategory['foodType']>, string> = {
  VEG: '🟢 Veg',
  NON_VEG: '🔴 Non-Veg',
  VEGAN: '🌱 Vegan',
  BEVERAGE: '🥤 Beverage',
  MIXED: '🍽️ Mixed',
};

export const CreateMenuCategoryPage: React.FC<CreateMenuCategoryPageProps> = ({ onNavigate }) => {
  const {
    activeBranchId,
    addCategory,
    menuItems,
    deleteCategory,
  } = useAppStore();
  const access = useAccess();
  const { user } = useAuth();
  const [branchId, setBranchId] = useState(
    () => new URLSearchParams(window.location.search).get('branchId') || activeBranchId || user?.branchId || ''
  );
  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState<string[]>([]);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [restaurantSearch, setRestaurantSearch] = useState('');
  const [branchSearch, setBranchSearch] = useState('');
  const [restaurants, setRestaurants] = useState<Array<{
    id: string;
    name: string;
    branches: Array<{ id: string; name: string }>;
  }>>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [foodType, setFoodType] = useState<NonNullable<MenuCategory['foodType']>>('MIXED');
  const [image, setImage] = useState('');
  const [imageName, setImageName] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<MenuCategory | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [managedCategories, setManagedCategories] = useState<MenuCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesLoadError, setCategoriesLoadError] = useState('');
  const canCreate = access.can('menu.manage');
  const categoryBranches = useMemo(() => access.branches.filter((branch) => (
    branch.setupStatus !== 'archived'
    && (
      access.isCompanySuperAdmin
      || access.companyPermissions.includes('menu.read')
      || access.companyPermissions.includes('menu.manage')
      || branch.permissions.includes('menu.read')
      || branch.permissions.includes('menu.manage')
    )
  )), [access.branches, access.companyPermissions, access.isCompanySuperAdmin]);
  const manageableBranches = useMemo(() => access.branches.filter((branch) => (
    branch.setupStatus !== 'archived'
    && (
      access.isCompanySuperAdmin
      || access.companyPermissions.includes('menu.manage')
      || branch.permissions.includes('menu.manage')
    )
  )), [access.branches, access.companyPermissions, access.isCompanySuperAdmin]);
  const authorizedBranchIds = useMemo(
    () => new Set(manageableBranches.map((branch) => branch.id)),
    [manageableBranches]
  );
  const restaurantsWithManageableBranches = useMemo(() => restaurants
    .map((restaurant) => ({
      ...restaurant,
      branches: restaurant.branches.filter((branch) => authorizedBranchIds.has(branch.id)),
    }))
    .filter((restaurant) => restaurant.branches.length > 0), [restaurants, authorizedBranchIds]);
  const selectedRestaurants = restaurantsWithManageableBranches.filter(
    (restaurant) => selectedRestaurantIds.includes(restaurant.id)
  );
  const restaurantBranches = useMemo(() => (
    [...new Map(selectedRestaurants.flatMap((restaurant) => restaurant.branches)
      .map((branch) => [branch.id, branch])).values()]
  ), [selectedRestaurants]);
  const visibleRestaurants = restaurantsWithManageableBranches.filter((restaurant) => (
    restaurant.name.toLocaleLowerCase().includes(restaurantSearch.trim().toLocaleLowerCase())
  ));
  const visibleRestaurantBranches = restaurantBranches.filter((branch) => (
    branch.name.toLocaleLowerCase().includes(branchSearch.trim().toLocaleLowerCase())
  ));
  const requestedBranchId = new URLSearchParams(window.location.search).get('branchId') || '';
  const categoryListBranchId = editingCategory?.branchId
    || (categoryBranches.some((branch) => branch.id === requestedBranchId) ? requestedBranchId : '');

  useEffect(() => {
    let cancelled = false;
    listRestaurantsRequest()
      .then((rows) => {
        if (!cancelled) setRestaurants(rows || []);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setCategoriesLoadError(requestError instanceof Error ? requestError.message : 'Unable to load restaurants.');
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!restaurantsWithManageableBranches.length || editingCategory || selectedRestaurantIds.length) return;
    const currentBranchId = branchId || activeBranchId || user?.branchId || '';
    const restaurantForBranch = restaurantsWithManageableBranches.find((restaurant) => (
      restaurant.branches.some((branch) => branch.id === currentBranchId)
    ));
    if (restaurantForBranch) {
      setSelectedRestaurantIds([restaurantForBranch.id]);
      setSelectedBranchIds([currentBranchId]);
      if (branchId !== currentBranchId) setBranchId(currentBranchId);
      return;
    }
    if (restaurantsWithManageableBranches.length === 1) {
      const onlyRestaurant = restaurantsWithManageableBranches[0];
      setSelectedRestaurantIds([onlyRestaurant.id]);
      const initialBranchId = onlyRestaurant.branches.length === 1 ? onlyRestaurant.branches[0].id : '';
      if (initialBranchId) {
        setBranchId(initialBranchId);
        setSelectedBranchIds([initialBranchId]);
      }
    }
  }, [activeBranchId, branchId, editingCategory, restaurantsWithManageableBranches, selectedRestaurantIds.length, user?.branchId]);

  useEffect(() => {
    if (!editingCategory || !restaurantsWithManageableBranches.length) return;
    const restaurant = restaurantsWithManageableBranches.find((entry) => (
      entry.branches.some((branch) => branch.id === editingCategory.branchId)
    ));
    if (restaurant) {
      setSelectedRestaurantIds([restaurant.id]);
      setSelectedBranchIds([editingCategory.branchId]);
    }
  }, [editingCategory, restaurantsWithManageableBranches]);

  const visibleCategories = managedCategories
    .filter((category) => !categoryListBranchId || category.branchId === categoryListBranchId)
    .map((category) => ({
      ...category,
      itemCount: menuItems.filter((item) => item.categoryId === category._id).length,
    }))
    .sort((left, right) => (
      (left.sortOrder ?? left.displayOrder ?? 0) - (right.sortOrder ?? right.displayOrder ?? 0)
      || left.name.localeCompare(right.name)
    ));

  useEffect(() => {
    let cancelled = false;
    const loadCategories = async () => {
      if (!categoryBranches.length) {
        setManagedCategories([]);
        setCategoriesLoadError('');
        setCategoriesLoading(false);
        return;
      }
      setCategoriesLoading(true);
      setCategoriesLoadError('');
      setManagedCategories([]);
      try {
        const branchesToLoad = categoryListBranchId
          ? categoryBranches.filter((branch) => branch.id === categoryListBranchId)
          : categoryBranches;
        const categoryLists = await Promise.all(branchesToLoad.map(async (branch) => {
          const response = await api.get('/menu/categories', {
            params: { status: 'ALL', branchId: branch.id },
          });
          const rows = response.data?.data || response.data || [];
          if (!Array.isArray(rows)) {
            throw new Error(`The category list for ${branch.name} is invalid.`);
          }
          return rows.map((category: MenuCategory & { _id: string; branchId?: string; sortOrder?: number; status?: 'ACTIVE' | 'INACTIVE' }) => ({
            ...category,
            _id: String(category._id),
            branchId: String(category.branchId || branch.id),
            branchName: branch.name,
            displayOrder: category.sortOrder ?? category.displayOrder ?? 0,
            isActive: category.status !== 'INACTIVE',
          }));
        }));
        if (!cancelled) {
          setManagedCategories(categoryLists.flat());
        }
      } catch (requestError) {
        if (!cancelled) {
          setCategoriesLoadError(requestError instanceof Error ? requestError.message : 'Unable to load menu categories.');
        }
      } finally {
        if (!cancelled) setCategoriesLoading(false);
      }
    };
    loadCategories();
    return () => { cancelled = true; };
  }, [categoryBranches, categoryListBranchId]);

  const resetForm = () => {
    setIsFormOpen(false);
    setEditingCategory(null);
    setName('');
    setDescription('');
    setFoodType('MIXED');
    setImage('');
    setImageName('');
    setSortOrder('0');
    setSelectedRestaurantIds([]);
    setSelectedBranchIds([]);
    setRestaurantSearch('');
    setBranchSearch('');
    setError('');
    setNotice('');
  };

  const startEditing = (category: MenuCategory) => {
    setIsFormOpen(true);
    setEditingCategory(category);
    setBranchId(category.branchId || '');
    const matchingRestaurant = restaurantsWithManageableBranches.find((restaurant) => (
      restaurant.branches.some((branch) => branch.id === category.branchId)
    ));
    setSelectedRestaurantIds(matchingRestaurant ? [matchingRestaurant.id] : []);
    setSelectedBranchIds(category.branchId ? [category.branchId] : []);
    setName(category.name);
    setDescription(category.description || '');
    setFoodType(category.foodType || 'MIXED');
    setImage(category.image || '');
    setImageName(category.image ? 'Current category image' : '');
    setSortOrder(String(category.sortOrder ?? category.displayOrder ?? 0));
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const requestedCategoryId = new URLSearchParams(window.location.search).get('edit');
    if (!requestedCategoryId || editingCategory) return;
    const category = managedCategories.find((item) => item._id === requestedCategoryId);
    if (category) {
      startEditing(category);
      onNavigate('/admin/menu/categories/new', true);
    }
  }, [editingCategory, managedCategories, onNavigate]);

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== 'image/png') {
      setError('Choose a PNG image.');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setError('Category images must be 2 MB or smaller.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string' || !reader.result.startsWith('data:image/png;base64,iVBORw0KGgo')) {
        setError('The selected image could not be read. Please try another file.');
        return;
      }
      setImage(reader.result);
      setImageName(file.name);
      setError('');
    };
    reader.onerror = () => setError('The selected image could not be read. Please try another file.');
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImage('');
    setImageName('');
  };

  const handleSubmit = async (event: React.FormEvent, publish: boolean) => {
    event.preventDefault();
    if (!canCreate) {
      setError('You do not have permission to manage menu categories.');
      return;
    }
    const targetBranchIds = editingCategory?.branchId ? [editingCategory.branchId] : selectedBranchIds;
    const targetRestaurantIds = selectedRestaurantIds;
    if (!targetBranchIds.length || !targetRestaurantIds.length) {
      setError('Select at least one restaurant and one branch before creating a menu category.');
      return;
    }
    if (!name.trim()) {
      setError('Enter a category name.');
      return;
    }

    setError('');
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        foodType,
        image,
        sortOrder: Number(sortOrder),
        status: publish ? 'ACTIVE' : 'INACTIVE',
      };
      const response = editingCategory
        ? await api.put(`/menu/categories/${editingCategory._id}`, payload)
        : await api.post('/menu/categories/bulk', {
          ...payload,
          restaurantIds: targetRestaurantIds,
          branchIds: targetBranchIds,
        });
      const savedRows = response.data?.data || response.data;
      const savedCategories = Array.isArray(savedRows) ? savedRows : [savedRows];
      const normalizedCategories = savedCategories.map((saved: MenuCategory & { _id: string; branchId?: string; sortOrder?: number }) => {
        const savedBranchId = String(saved.branchId || targetBranchIds[0]);
        return {
          ...saved,
          branchId: savedBranchId,
          branchName: manageableBranches.find((branch) => branch.id === savedBranchId)?.name || '',
          itemCount: editingCategory?.itemCount || 0,
          displayOrder: saved.sortOrder ?? Number(sortOrder),
          isActive: saved.status !== 'INACTIVE',
        } as MenuCategory;
      });
      setManagedCategories((previous) => [
        ...previous.filter((category) => !normalizedCategories.some((saved) => saved._id === category._id)),
        ...normalizedCategories,
      ]);
      for (const normalizedCategory of normalizedCategories) {
        if (normalizedCategory.isActive) addCategory(normalizedCategory);
        else if (editingCategory) deleteCategory(editingCategory._id);
      }
      resetForm();
      setNotice(`${normalizedCategories.length} ${normalizedCategories.length === 1 ? 'category' : 'categories'} ${publish ? 'published' : 'saved as draft'} successfully.`);
    } catch (requestError) {
      if (requestError instanceof Error && 'status' in requestError && requestError.status === 409) {
        setError(requestError.message);
      } else {
        setError(requestError instanceof Error ? requestError.message : 'Unable to create category.');
      }
    } finally {
      setSaving(false);
    }
  };

  const changePublishStatus = async (category: MenuCategory, nextStatus: 'ACTIVE' | 'INACTIVE') => {
    setSaving(true);
    setError('');
    try {
      const response = await api.put(`/menu/categories/${category._id}`, { status: nextStatus });
      const saved = response.data?.data || response.data;
      const updated = { ...category, ...saved, status: nextStatus, isActive: nextStatus === 'ACTIVE' };
      setManagedCategories((previous) => previous.map((item) => item._id === category._id ? updated : item));
      if (nextStatus === 'ACTIVE') addCategory(updated);
      else deleteCategory(category._id);
      setNotice(nextStatus === 'ACTIVE' ? `"${category.name}" is published.` : `"${category.name}" is now a draft.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update category status.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteCategory = async () => {
    if (!categoryToDelete) return;
    setSaving(true);
    setDeleteError('');
    try {
      await api.delete(`/menu/categories/${categoryToDelete._id}`);
      deleteCategory(categoryToDelete._id);
      setManagedCategories((previous) => previous.filter((item) => item._id !== categoryToDelete._id));
      setCategoryToDelete(null);
      if (editingCategory?._id === categoryToDelete._id) resetForm();
    } catch (requestError) {
      setDeleteError(requestError instanceof Error ? requestError.message : 'Unable to delete category.');
      setCategoryToDelete(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
            <FolderPlus className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white md:text-2xl">Menu Categories</h1>
            <p className="mt-1 text-sm text-slate-500">Create restaurant-specific categories for your menu items.</p>
          </div>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setIsFormOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 sm:self-auto"
          >
            <Plus className="h-4 w-4" /> Add Category
          </button>
        )}
      </header>

      {notice && !isFormOpen && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          {notice}
        </p>
      )}
      {error && !isFormOpen && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </p>
      )}

      {!canCreate ? (
        <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          You have view access to the menu, but category management permission is required to create a category.
        </p>
      ) : isFormOpen ? (
      <form
        onSubmit={(event) => handleSubmit(
          event,
          (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'publish'
        )}
        className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-7"
      >
        {error && (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            {notice}
          </div>
        )}

        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">{editingCategory ? `Edit ${editingCategory.name}` : 'Create a category'}</h2>
            <p className="mt-1 text-xs text-slate-500">Add a clear name and optional information customers and staff can use to identify this group.</p>
          </div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Category name <span className="text-rose-500">*</span>
            <input
              autoFocus
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Starters"
              className={inputClass}
            />
            <span className="mt-1 block text-right text-[11px] font-normal text-slate-400">{name.length}/100</span>
          </label>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Description
            <textarea
              rows={4}
              maxLength={500}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe the items that belong in this category."
              className={inputClass}
            />
            <span className="mt-1 block text-right text-[11px] font-normal text-slate-400">{description.length}/500</span>
          </label>
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Restaurants <span className="text-rose-500">*</span>
              </h3>
              <span className="text-[10px] text-slate-500">{selectedRestaurantIds.length} selected</span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="search"
                value={restaurantSearch}
                onChange={(event) => setRestaurantSearch(event.target.value)}
                placeholder="Search restaurants..."
                aria-label="Search restaurants"
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {visibleRestaurants.map((restaurant) => {
                const checked = selectedRestaurantIds.includes(restaurant.id);
                return (
                  <label key={restaurant.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={Boolean(editingCategory)}
                      onChange={(event) => {
                        const nextRestaurantIds = event.target.checked
                          ? [...selectedRestaurantIds, restaurant.id]
                          : selectedRestaurantIds.filter((id) => id !== restaurant.id);
                        const nextBranchIds = event.target.checked
                          ? [...selectedBranchIds, ...restaurant.branches.map((branch) => branch.id)]
                          : selectedBranchIds;
                        const branchIdsForNextRestaurants = new Set(
                          restaurantsWithManageableBranches
                            .filter((entry) => nextRestaurantIds.includes(entry.id))
                            .flatMap((entry) => entry.branches.map((branch) => branch.id))
                        );
                        const uniqueNextBranchIds = [...new Set([
                          ...nextBranchIds.filter((id) => branchIdsForNextRestaurants.has(id)),
                        ])];
                        setSelectedRestaurantIds(nextRestaurantIds);
                        setSelectedBranchIds(uniqueNextBranchIds);
                        setBranchId(uniqueNextBranchIds[0] || '');
                      }}
                      className="h-4 w-4 rounded text-indigo-600"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-700 dark:text-slate-200">{restaurant.name}</span>
                    <span className="text-[10px] text-slate-500">{restaurant.branches.length} branches</span>
                  </label>
                );
              })}
              {visibleRestaurants.length === 0 && <p className="col-span-full px-1 py-2 text-xs text-slate-500">No restaurants match your search.</p>}
            </div>
            <p className="text-[11px] font-normal text-slate-500">Selecting a restaurant includes its manageable branches. You can remove individual branches below.</p>
          </section>
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Branches <span className="text-rose-500">*</span>
              </h3>
              <span className="text-[10px] text-slate-500">{selectedBranchIds.length} selected</span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="search"
                value={branchSearch}
                onChange={(event) => setBranchSearch(event.target.value)}
                disabled={!selectedRestaurantIds.length}
                placeholder="Search branches..."
                aria-label="Search branches"
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-indigo-400 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {visibleRestaurantBranches.map((branch) => (
                <label key={branch.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">
                  <input
                    type="checkbox"
                    checked={selectedBranchIds.includes(branch.id)}
                    disabled={Boolean(editingCategory)}
                    onChange={(event) => {
                      const nextBranchIds = event.target.checked
                        ? [...selectedBranchIds, branch.id]
                        : selectedBranchIds.filter((id) => id !== branch.id);
                      setSelectedBranchIds(nextBranchIds);
                      setBranchId(nextBranchIds[0] || '');
                    }}
                    className="h-4 w-4 rounded text-indigo-600"
                  />
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-700 dark:text-slate-200">{branch.name}</span>
                </label>
              ))}
              {visibleRestaurantBranches.length === 0 && (
                <p className="col-span-full px-1 py-2 text-xs text-slate-500">
                  {selectedRestaurantIds.length ? 'No branches match your search.' : 'Select one or more restaurants first.'}
                </p>
              )}
            </div>
            <p className="text-[11px] font-normal text-slate-500">The category is saved separately in each selected branch.</p>
          </section>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Category food type
            <select value={foodType} onChange={(event) => setFoodType(event.target.value as NonNullable<MenuCategory['foodType']>)} className={inputClass}>
              {Object.entries(FOOD_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] font-normal text-slate-400">Mixed allows different food types in the same category. Menu items can still have their own type.</span>
          </label>
          <div className="space-y-2">
            <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Category image <span className="font-normal text-slate-400">(optional)</span>
            </span>
            {image ? (
              <div className="flex items-center gap-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <img src={image} alt="Category preview" className="h-16 w-16 shrink-0 rounded-full bg-slate-100 object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{imageName}</p>
                  <p className="mt-1 text-xs text-slate-500">Image ready to save with this category.</p>
                  <button type="button" onClick={removeImage} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700">
                    <Trash2 className="h-3.5 w-3.5" /> Remove image
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center transition hover:border-indigo-400 hover:bg-indigo-50/50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-indigo-500">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-300">
                  <ImagePlus className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Choose an image to upload</span>
                <span className="text-xs text-slate-500">PNG · up to 2 MB</span>
                <input type="file" accept="image/png" onChange={handleImageChange} className="sr-only" />
              </label>
            )}
          </div>
        </section>

        <section className="grid gap-4 border-t border-slate-100 pt-5 dark:border-slate-800 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Save draft to keep this category inactive, or publish it to make it available for menu items.
          </div>
        </section>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 dark:border-slate-800 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={saving}
            onClick={resetForm}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {editingCategory ? 'Cancel edit' : 'Cancel'}
          </button>
          <button
            type="submit"
            value="draft"
            disabled={saving || manageableBranches.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save draft
          </button>
          <button
            type="submit"
            value="publish"
            disabled={saving || manageableBranches.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {saving ? 'Saving category…' : 'Publish category'}
          </button>
        </div>
      </form>
      ) : null}

      {!isFormOpen && categoryBranches.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Existing categories</h2>
              <p className="mt-1 text-xs text-slate-500">Edit details, publish drafts, or remove categories that are not being used.</p>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
              {visibleCategories.length}
            </span>
          </div>
          {deleteError && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              {deleteError}
            </p>
          )}
          {categoriesLoadError && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              {categoriesLoadError}
            </p>
          )}
          {categoriesLoading && (
            <p role="status" className="inline-flex items-center gap-2 text-xs text-slate-500">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Loading categories…
            </p>
          )}
          {categoriesLoading ? null : visibleCategories.length ? (
            <div className="space-y-3">
              {visibleCategories.map((category) => {
                const published = (category.status || (category.isActive ? 'ACTIVE' : 'INACTIVE')) === 'ACTIVE';
                return (
                  <article key={category._id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center">
                    {category.image ? (
                      <img src={category.image} alt="" className="h-14 w-14 shrink-0 rounded-full bg-slate-100 object-cover" />
                    ) : (
                      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-indigo-50 text-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-300">
                        <FolderPlus className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-900 dark:text-white">{category.name}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${published ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'}`}>
                          {published ? 'Published' : 'Draft'}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {FOOD_TYPE_LABELS[category.foodType || 'MIXED']}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{category.description || 'No description added.'}</p>
                      <p className="mt-2 text-[11px] text-slate-400">
                        {category.itemCount} menu {category.itemCount === 1 ? 'item' : 'items'}
                        {' · '}Display order {category.sortOrder ?? category.displayOrder ?? 0}
                        {categoryBranches.length > 1 && category.branchId
                          ? ` · ${categoryBranches.find((branch) => branch.id === category.branchId)?.name || 'Branch'}`
                          : ''}
                      </p>
                    </div>
                    {canCreate && manageableBranches.some((branch) => branch.id === category.branchId) && (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={saving} onClick={() => startEditing(category)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                          <Edit2 className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button type="button" disabled={saving} onClick={() => changePublishStatus(category, published ? 'INACTIVE' : 'ACTIVE')} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                          {published ? <Save className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                          {published ? 'Unpublish' : 'Publish'}
                        </button>
                        <button type="button" disabled={saving || category.itemCount > 0} onClick={() => { setDeleteError(''); setCategoryToDelete(category); }} title={category.itemCount ? 'Move menu items to another category before deleting.' : 'Delete category'} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30">
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
              No categories for this branch yet. Select Add Category to create one.
            </div>
          )}
          {!isFormOpen && categoryBranches.length === 0 && (
            <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              You do not have menu read access for any available branch.
            </p>
          )}
        </section>
      )}
      <ConfirmDialog
        isOpen={Boolean(categoryToDelete)}
        onClose={() => setCategoryToDelete(null)}
        onConfirm={confirmDeleteCategory}
        title="Delete menu category?"
        message={`Delete "${categoryToDelete?.name}"? This cannot be undone. Categories with menu items must have those items moved first.`}
        confirmText="Delete category"
        isDangerous
        isLoading={saving}
      />
    </div>
  );
};

export default CreateMenuCategoryPage;
