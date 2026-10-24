import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Building2, Check, ImagePlus, LoaderCircle, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useAccess } from '../../context/AccessContext.jsx';
import { assignRestaurantBranchesRequest, deleteRestaurantRequest, listRestaurantsRequest, updateRestaurantRequest } from '../../services/branch.api.js';

interface Restaurant {
  id: string;
  name: string;
  image?: string;
  branches: Array<{ id: string; name: string; city: string }>;
}

const RestaurantsPage: React.FC = () => {
  const access = useAccess();
  const selectedRestaurantId = new URLSearchParams(window.location.search).get('restaurant');
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editingName, setEditingName] = useState('');
  const [editingImage, setEditingImage] = useState('');
  const [assigningId, setAssigningId] = useState('');
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState('');
  const [saving, setSaving] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [readingImage, setReadingImage] = useState(false);
  const editImageInput = useRef<HTMLInputElement>(null);
  const canManageRestaurants = access.isCompanySuperAdmin
    || access.companyPermissions.includes('branches.create')
    || access.companyPermissions.includes('branches.update');
  const canAssignBranches = canManageRestaurants;
  const availableBranches = access.branches.filter((branch: { setupStatus?: string }) => branch.setupStatus !== 'archived');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRestaurants(await listRestaurantsRequest());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load restaurants.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    window.addEventListener('restaurants:refresh', load);
    return () => window.removeEventListener('restaurants:refresh', load);
  }, [load]);

  const save = async (restaurantId: string) => {
    const name = editingName.trim();
    if (!name) {
      setError('Restaurant name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const updated = await updateRestaurantRequest(restaurantId, { name, image: editingImage });
      setRestaurants((current) => current.map((restaurant) => (
        restaurant.id === restaurantId ? { ...restaurant, name: updated.name, image: updated.image } : restaurant
      )));
      setEditingId('');
      setEditingName('');
      setEditingImage('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update restaurant.');
    } finally {
      setSaving(false);
    }
  };

  const chooseImage = (file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Choose a PNG, JPG, or WebP image.');
      if (editImageInput.current) editImageInput.current.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Restaurant image must be 5 MB or smaller.');
      if (editImageInput.current) editImageInput.current.value = '';
      return;
    }
    setReadingImage(true);
    const reader = new FileReader();
    reader.onload = () => {
      setReadingImage(false);
      if (typeof reader.result !== 'string') {
        setError('Unable to read this image. Please choose another file.');
        return;
      }
      setEditingImage(reader.result);
      setError('');
    };
    reader.onerror = () => {
      setReadingImage(false);
      setError('Unable to read this image. Please choose another file.');
    };
    reader.readAsDataURL(file);
  };

  const assignBranches = async (restaurantId: string) => {
    setAssigning(true);
    setError('');
    try {
      const linkedBranchIds = restaurants.find((restaurant) => restaurant.id === restaurantId)?.branches.map((branch) => branch.id) || [];
      const removeBranchIds = linkedBranchIds.filter((branchId) => !selectedBranchIds.includes(branchId));
      const branches = await assignRestaurantBranchesRequest(restaurantId, selectedBranchIds, removeBranchIds);
      await access.refresh();
      setRestaurants((current) => current.map((restaurant) => (
        restaurant.id === restaurantId ? { ...restaurant, branches } : restaurant
      )));
      setAssigningId('');
      setSelectedBranchIds([]);
      window.dispatchEvent(new Event('restaurants:refresh'));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to assign branches.');
    } finally {
      setAssigning(false);
    }
  };

  const removeRestaurant = async (restaurant: Restaurant) => {
    if (!window.confirm(`Delete "${restaurant.name}"? Only restaurants with no branches can be deleted.`)) return;
    setDeletingId(restaurant.id);
    setError('');
    try {
      await deleteRestaurantRequest(restaurant.id);
      setRestaurants((current) => current.filter((item) => item.id !== restaurant.id));
      if (selectedRestaurantId === restaurant.id) window.history.replaceState(null, '', '/admin/restaurants');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to delete restaurant.');
    } finally {
      setDeletingId('');
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white md:text-2xl">Restaurants</h1>
          <p className="mt-1 text-sm text-slate-500">Manage restaurant names separately from their branch locations.</p>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}
      {loading ? (
        <p role="status" className="inline-flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading restaurants…</p>
      ) : restaurants.length ? (
        <div className="space-y-3">
          {restaurants.map((restaurant) => (
            <article key={restaurant.id} aria-current={selectedRestaurantId === restaurant.id ? 'true' : undefined} className={`flex flex-col gap-3 rounded-2xl border bg-white p-4 dark:bg-slate-900 sm:flex-row sm:flex-wrap sm:items-center ${selectedRestaurantId === restaurant.id ? 'border-indigo-400 ring-1 ring-indigo-400/30 dark:border-indigo-500' : 'border-slate-200 dark:border-slate-800'}`}>
              {(editingId === restaurant.id ? editingImage : restaurant.image) ? (
                <img src={editingId === restaurant.id ? editingImage : restaurant.image} alt={`${restaurant.name} restaurant`} className="h-16 w-16 shrink-0 rounded-xl object-cover" />
              ) : (
                <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300"><Building2 className="h-6 w-6" /></div>
              )}
              <div className="min-w-0 flex-1">
                {editingId === restaurant.id ? (
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Restaurant name
                      <input autoFocus maxLength={100} value={editingName} onChange={(event) => setEditingName(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                    </label>
                    <input ref={editImageInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={`Upload ${restaurant.name} image`} onChange={(event) => { chooseImage(event.target.files?.[0]); event.target.value = ''; }} />
                    <button type="button" onClick={() => editImageInput.current?.click()} className="flex w-full max-w-sm items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-2.5 text-left transition hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-950/50">
                      {editingImage
                        ? <img src={editingImage} alt={`${restaurant.name} image preview`} className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                        : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"><ImagePlus className="h-5 w-5" /></span>}
                      <span>
                        <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">{editingImage ? 'Image selected — click to change' : 'Choose restaurant image'}</span>
                        <span className="mt-1 block text-[11px] text-slate-500">PNG, JPG or WebP · up to 5 MB</span>
                      </span>
                    </button>
                    {editingImage && <button type="button" onClick={() => { setEditingImage(''); if (editImageInput.current) editImageInput.current.value = ''; }} className="text-xs font-semibold text-rose-600">Remove image</button>}
                  </div>
                ) : (
                  <>
                    <h2 className="truncate font-bold text-slate-900 dark:text-white">{restaurant.name}</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {restaurant.branches.length} {restaurant.branches.length === 1 ? 'branch' : 'branches'}
                      {restaurant.branches.length > 0 && ` · ${restaurant.branches.map((branch) => branch.name).join(', ')}`}
                    </p>
                  </>
                )}
              </div>
              {canManageRestaurants && (
                editingId === restaurant.id ? (
                  <div className="flex gap-2">
                    <button type="button" disabled={saving || readingImage} onClick={() => save(restaurant.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                      {saving || readingImage ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} {readingImage ? 'Loading image…' : 'Save'}
                    </button>
                    <button type="button" disabled={saving} onClick={() => { setEditingId(''); setEditingName(''); setEditingImage(''); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                      <X className="h-3.5 w-3.5" /> Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    {canAssignBranches && (
                      <button type="button" onClick={() => { setAssigningId(assigningId === restaurant.id ? '' : restaurant.id); setSelectedBranchIds(restaurant.branches.map((branch) => branch.id)); setError(''); }} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 dark:border-indigo-900 dark:text-indigo-300">
                        <Plus className="h-3.5 w-3.5" /> Assign branches
                      </button>
                    )}
                    <button type="button" onClick={() => { setEditingId(restaurant.id); setEditingName(restaurant.name); setEditingImage(restaurant.image || ''); setError(''); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button type="button" disabled={deletingId === restaurant.id} onClick={() => removeRestaurant(restaurant)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40">
                      {deletingId === restaurant.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
                    </button>
                  </div>
                )
              )}
              {assigningId === restaurant.id && (
                <section className="w-full rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/20 sm:basis-full">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Choose branches for {restaurant.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">Select multiple branches. Branches can be linked to more than one restaurant.</p>
                  {availableBranches.length ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {availableBranches.map((branch: { id: string; name: string; city?: string; restaurantId?: string; restaurantIds?: string[] }) => {
                        const checked = selectedBranchIds.includes(branch.id);
                        const currentRestaurants = restaurants.filter((item) => (
                          (branch.restaurantIds || [branch.restaurantId].filter(Boolean)).includes(item.id)
                        ));
                        return (
                          <label key={branch.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${checked ? 'border-indigo-300 bg-white dark:border-indigo-700 dark:bg-slate-900' : 'border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/50'}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setSelectedBranchIds((current) => checked ? current.filter((id) => id !== branch.id) : [...current, branch.id])}
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-100">{branch.name}</span>
                              <span className="mt-1 block truncate text-[11px] text-slate-500">{branch.city || 'Branch location'}{currentRestaurants.length ? ` · Linked: ${currentRestaurants.map((item) => item.name).join(', ')}` : ''}</span>
                            </span>
                            {checked && <Check className="h-4 w-4 shrink-0 text-indigo-600" />}
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-slate-500">No branches are available to assign.</p>
                  )}
                  <div className="mt-4 flex justify-end gap-2">
                    <button type="button" disabled={assigning} onClick={() => { setAssigningId(''); setSelectedBranchIds([]); }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300">Cancel</button>
                    <button type="button" disabled={assigning || (selectedBranchIds.length === 0 && restaurant.branches.length === 0)} onClick={() => assignBranches(restaurant.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                      {assigning ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Update restaurant links
                    </button>
                  </div>
                </section>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">No restaurants have been added yet.</p>
      )}
    </div>
  );
};

export default RestaurantsPage;
