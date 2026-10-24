import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  LoaderCircle,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import api from '../../services/api.js';
import { useAppStore } from '../../store/AppStore.tsx';
import { useAccess } from '../../context/AccessContext.jsx';
import { createBranchRequest, deleteBranchRequest, listBranchesRequest, listRestaurantsRequest } from '../../services/branch.api.js';

const EMPTY_FORM = {
  restaurantIds: [],
  name: '',
  code: '',
  addressLine1: '',
  city: '',
  countryCode: 'IN',
  adminName: '',
  adminEmail: '',
  adminPassword: '',
};

const messageFrom = (error) => ({
  message: error?.message || 'The request failed. Please try again.',
  requestId: error?.requestId || '',
  status: error?.status || null,
});

const inputClassName = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white';

export const BranchesPage = ({ onNavigate }) => {
  const access = useAccess();
  const { setActiveBranchId } = useAppStore();
  const [rows, setRows] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [search, setSearch] = useState('');
  const [setupStatus, setSetupStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingBranchId, setDeletingBranchId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [createError, setCreateError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [restaurantSearch, setRestaurantSearch] = useState('');
  const [menuItems, setMenuItems] = useState([]);
  const [menuItemSearch, setMenuItemSearch] = useState('');
  const [selectedMenuItemIds, setSelectedMenuItemIds] = useState([]);
  const [loadingMenuItems, setLoadingMenuItems] = useState(false);
  const createKey = useRef('');

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const [data, restaurantRows] = await Promise.all([
        listBranchesRequest({ search, setupStatus, page, limit: 20 }),
        listRestaurantsRequest(),
      ]);
      setRows(data.branches || []);
      setRestaurants(restaurantRows || []);
      setPagination(data.pagination || null);
      setStatus('ready');
    } catch (requestError) {
      setError(messageFrom(requestError));
      setStatus('error');
    }
  }, [search, setupStatus, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!creating) return undefined;
    let cancelled = false;
    const readableBranches = access.branches.filter((branch) => (
      branch.setupStatus !== 'archived'
      && (access.isCompanySuperAdmin
        || access.companyPermissions.includes('menu.read')
        || access.companyPermissions.includes('menu.manage')
        || branch.permissions.includes('menu.read')
        || branch.permissions.includes('menu.manage'))
    ));
    setLoadingMenuItems(true);
    Promise.all(readableBranches.map(async (branch) => {
      const firstPage = await api.get('/menu/items', { params: { branchId: branch.id, limit: 100, page: 1 } });
      const firstData = firstPage.data?.data;
      const items = [...(firstData?.items || [])];
      const pages = Math.max(1, Number(firstData?.pagination?.pages) || 1);
      for (let pageNumber = 2; pageNumber <= pages; pageNumber += 1) {
        const response = await api.get('/menu/items', {
          params: { branchId: branch.id, limit: 100, page: pageNumber },
        });
        const pageItems = response.data?.data?.items;
        if (!Array.isArray(pageItems)) throw new Error(`Menu items could not be loaded for ${branch.name}.`);
        items.push(...pageItems);
      }
      return items.map((item) => ({
        ...item,
        sourceBranchId: branch.id,
        sourceBranchName: branch.name,
        categoryName: item.categoryId?.name || item.categoryName || 'Uncategorized',
        categoryId: String(item.categoryId?._id || item.categoryId),
      }));
    }))
      .then((rowsByBranch) => {
        if (!cancelled) {
          const uniqueItems = new Map();
          rowsByBranch.flat().forEach((item) => {
            const key = String(item.sku || item.name).trim().toLocaleLowerCase();
            if (!uniqueItems.has(key)) uniqueItems.set(key, item);
          });
          setMenuItems([...uniqueItems.values()]);
        }
      })
      .catch((requestError) => {
        if (!cancelled) setCreateError(messageFrom(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoadingMenuItems(false);
      });
    return () => { cancelled = true; };
  }, [creating, access.branches, access.companyPermissions, access.isCompanySuperAdmin]);

  useEffect(() => {
    const openCreate = () => {
      setCreateError(null);
      setCreating(true);
    };
    if (window.sessionStorage.getItem('rms:open-branch-create') === '1') {
      window.sessionStorage.removeItem('rms:open-branch-create');
      openCreate();
    }
    window.addEventListener('rms:open-branch-create', openCreate);
    return () => window.removeEventListener('rms:open-branch-create', openCreate);
  }, []);

  const closeCreate = () => {
    if (saving) return;
    setCreating(false);
    setCreateError(null);
  };

  const updateForm = (name, value) => {
    createKey.current = '';
    setForm((current) => ({ ...current, [name]: value }));
  };

  const create = async (event) => {
    event.preventDefault();
    setCreateError(null);
    if (form.restaurantIds.length === 0) {
      setCreateError({ message: 'Select at least one restaurant for this branch.' });
      return;
    }
    setSaving(true);
    if (!createKey.current) {
      createKey.current = `branch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    try {
      const data = await createBranchRequest({
        restaurantIds: form.restaurantIds,
        menuItemIds: selectedMenuItemIds,
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        addressLine1: form.addressLine1.trim(),
        city: form.city.trim(),
        countryCode: form.countryCode.trim().toUpperCase(),
        branchAdmin: {
          name: form.adminName.trim(),
          email: form.adminEmail.trim().toLowerCase(),
          password: form.adminPassword,
        },
      }, createKey.current);
      createKey.current = '';
      setForm(EMPTY_FORM);
      setSelectedMenuItemIds([]);
      setRestaurantSearch('');
      setMenuItemSearch('');
      setCreating(false);
      await access.refresh();
      onNavigate(`/admin/branches/${data.branch.id}`);
    } catch (requestError) {
      setCreateError(messageFrom(requestError));
    } finally {
      setSaving(false);
    }
  };

  const removeBranch = async (branch) => {
    const confirmed = window.confirm(
      `Permanently delete "${branch.name}" (${branch.code})? This cannot be undone. Branches with saved setup or business records must be archived instead.`
    );
    if (!confirmed) return;

    setDeletingBranchId(branch.id);
    setDeleteError(null);
    try {
      await deleteBranchRequest(branch.id);
      await access.refresh();
      if (rows.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        await load();
      }
    } catch (requestError) {
      setDeleteError(messageFrom(requestError));
    } finally {
      setDeletingBranchId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-white to-indigo-50 p-6 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40 md:p-8">
        <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-indigo-400/10 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-300">
              <Building2 className="h-3.5 w-3.5" />               Restaurant locations
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white md:text-3xl">
              Branch management
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Add a branch under an existing restaurant and complete its setup. New branches start as drafts until configuration is finished.
            </p>
          </div>
          {access.can('branches.create') && (
            <button
              type="button"
              onClick={() => { setCreateError(null); setCreating(true); }}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/20"
            >
              <Plus className="h-4 w-4" /> Add Branch
            </button>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            aria-label="Search branches"
            value={search}
            onChange={(event) => { setPage(1); setSearch(event.target.value); }}
            placeholder="Search by branch, code, or city"
            className={`${inputClassName} pl-10`}
          />
        </label>
        <select
          aria-label="Filter branch status"
          value={setupStatus}
          onChange={(event) => { setPage(1); setSetupStatus(event.target.value); }}
          className={`${inputClassName} sm:w-56`}
        >
          <option value="">All open branches</option>
          <option value="draft">Draft</option>
          <option value="ready_for_testing">Ready for testing</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="archived">Archived history</option>
        </select>
      </section>

      {deleteError && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/60 dark:bg-rose-950/30">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
          <div>
            <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">Branch could not be deleted</p>
            <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">{deleteError.message}</p>
            {deleteError.requestId && (
              <p className="mt-1 text-xs text-rose-600/80 dark:text-rose-300/80">Request ID: {deleteError.requestId}</p>
            )}
          </div>
        </div>
      )}

      {status === 'error' && (
        <div role="alert" className="flex flex-col gap-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/60 dark:bg-rose-950/30 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
            <div>
              <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">Branches could not be loaded</p>
              <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">{error?.message}</p>
              {error?.requestId && (
                <p className="mt-1 text-xs text-rose-600/80 dark:text-rose-300/80">Request ID: {error.requestId}</p>
              )}
            </div>
          </div>
          <button type="button" onClick={load} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950">
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      )}

      {status === 'loading' && (
        <div aria-live="polite" className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="h-4 w-24 rounded bg-slate-100 dark:bg-slate-800" />
              <div className="mt-5 h-5 w-2/3 rounded bg-slate-100 dark:bg-slate-800" />
              <div className="mt-4 h-3 w-1/2 rounded bg-slate-100 dark:bg-slate-800" />
            </div>
          ))}
        </div>
      )}

      {status === 'ready' && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
            <Building2 className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-base font-bold text-slate-900 dark:text-white">No branches found</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Try changing your search or add a branch under a restaurant.</p>
        </div>
      )}

      {status === 'ready' && rows.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {rows.map((branch) => (
            <article key={branch.id} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-900">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-indigo-50 px-2 py-1 font-mono text-[10px] font-bold tracking-wide text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{branch.code}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">{(branch.setupStatus || 'draft').replaceAll('_', ' ')}</span>
                  </div>
                  <h2 className="mt-3 truncate text-lg font-bold text-slate-900 dark:text-white">{branch.name}</h2>
                  <p className="mt-1 text-xs font-medium text-indigo-600 dark:text-indigo-300">
                    Restaurants: {restaurants.filter((restaurant) => restaurant.branches.some((location) => location.id === branch.id)).map((restaurant) => restaurant.name).join(', ') || 'Not assigned'}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                    <MapPin className="h-4 w-4 shrink-0" /> {branch.city || 'Address not set'}
                  </p>
                </div>
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-50 text-slate-400 transition group-hover:bg-indigo-50 group-hover:text-indigo-600 dark:bg-slate-800 dark:group-hover:bg-indigo-950 dark:group-hover:text-indigo-300">
                  <Building2 className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-500 dark:text-slate-400">Setup progress</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{branch.progress?.percent ?? 0}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${Math.min(100, branch.progress?.percent ?? 0)}%` }} />
                </div>
                <p className="mt-2 text-xs text-slate-400">{branch.progress?.blockedModules ?? 0} later setup modules blocked</p>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                <span className="text-[11px] text-slate-400">Updated {branch.updatedAt ? new Date(branch.updatedAt).toLocaleDateString() : '—'}</span>
                <div className="flex gap-2">
                  {branch.setupStatus !== 'archived' && (
                    <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => { setActiveBranchId(branch.id); onNavigate('/admin/dashboard'); }}>Workspace</button>
                  )}
                  {access.isCompanySuperAdmin && (
                    <button
                      type="button"
                      aria-label={`Delete ${branch.name}`}
                      title="Permanently delete branch"
                      disabled={deletingBranchId === branch.id}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900/70 dark:text-rose-300 dark:hover:bg-rose-950/40"
                      onClick={() => removeBranch(branch)}
                    >
                      {deletingBranchId === branch.id
                        ? <LoaderCircle className="h-4 w-4 animate-spin" />
                        : <Trash2 className="h-4 w-4" />}
                      Delete
                    </button>
                  )}
                  <button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 dark:bg-white dark:text-slate-900 dark:hover:bg-indigo-200" onClick={() => onNavigate(`/admin/branches/${branch.id}`)}>
                    Manage <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-slate-500 dark:text-slate-400">Page {pagination.page} of {pagination.pages}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700">Previous</button>
            <button type="button" disabled={page >= pagination.pages} onClick={() => setPage(page + 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700">Next</button>
          </div>
        </div>
      )}

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreate(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="create-branch-title" className="my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-violet-700 px-6 py-6 text-white sm:px-8">
              <div className="pointer-events-none absolute -right-6 -top-16 h-48 w-48 rounded-full border-[24px] border-white/10" />
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-white/15"><Building2 className="h-5 w-5" /></div>
                  <h2 id="create-branch-title" className="text-xl font-black">Add a branch</h2>
                  <p className="mt-1 text-sm text-indigo-100">Create a draft location and finish its setup when you’re ready.</p>
                </div>
                <button type="button" aria-label="Close dialog" disabled={saving} onClick={closeCreate} className="rounded-lg p-2 text-white/80 transition hover:bg-white/15 hover:text-white disabled:opacity-50">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="relative mt-5 flex items-center gap-2 text-xs font-semibold text-indigo-100">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Branch details</span>
                <span className="h-px w-8 bg-white/30" />
                <span className="rounded-full bg-white/10 px-3 py-1.5">Setup later</span>
              </div>
            </div>
            <form onSubmit={create} className="min-h-0 space-y-5 overflow-y-auto p-6 sm:p-8">
              {createError && (
                <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div><p>{createError.message}</p>{createError.requestId && <p className="mt-1 text-xs opacity-80">Request ID: {createError.requestId}</p>}</div>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 text-xs font-semibold text-slate-600 dark:text-slate-300 sm:col-span-2">
                  <label htmlFor="branch-restaurant-search">Restaurants <span className="text-rose-500">*</span></label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input id="branch-restaurant-search" value={restaurantSearch} onChange={(event) => setRestaurantSearch(event.target.value)} placeholder="Search restaurants..." className={`${inputClassName} pl-10`} />
                  </div>
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-950">
                    {restaurants
                      .filter((restaurant) => restaurant.name.toLowerCase().includes(restaurantSearch.trim().toLowerCase()))
                      .map((restaurant) => (
                        <label key={restaurant.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-900">
                          <input type="checkbox" checked={form.restaurantIds.includes(restaurant.id)} onChange={(event) => {
                            const next = event.target.checked
                              ? [...form.restaurantIds, restaurant.id]
                              : form.restaurantIds.filter((id) => id !== restaurant.id);
                            updateForm('restaurantIds', next);
                          }} className="h-4 w-4 rounded text-indigo-600" />
                          <span>{restaurant.name}</span>
                        </label>
                      ))}
                    {restaurants.length === 0 && <p className="px-2.5 py-2 text-slate-500">No restaurants available.</p>}
                    {restaurants.length > 0 && restaurants.filter((restaurant) => restaurant.name.toLowerCase().includes(restaurantSearch.trim().toLowerCase())).length === 0 && (
                      <p className="px-2.5 py-2 text-slate-500">No restaurants match your search.</p>
                    )}
                  </div>
                  <p className="text-[11px] font-normal text-slate-500">{form.restaurantIds.length} restaurant(s) selected.</p>
                </div>
                <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Branch name <span className="text-rose-500">*</span>
                  <input autoFocus required maxLength={100} value={form.name} onChange={(event) => updateForm('name', event.target.value)} placeholder="e.g. Riverside Kitchen" className={inputClassName} />
                </label>
                <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Branch code <span className="text-rose-500">*</span>
                  <input required pattern="[A-Za-z0-9_-]+" title="Use letters, numbers, hyphens, or underscores" value={form.code} onChange={(event) => updateForm('code', event.target.value.toUpperCase())} placeholder="e.g. RIV-01" className={`${inputClassName} font-mono uppercase`} />
                </label>
                <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 sm:col-span-2">
                  Street address
                  <input maxLength={200} value={form.addressLine1} onChange={(event) => updateForm('addressLine1', event.target.value)} placeholder="Street and building" className={inputClassName} />
                </label>
                <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  City
                  <input maxLength={100} value={form.city} onChange={(event) => updateForm('city', event.target.value)} placeholder="City" className={inputClassName} />
                </label>
                <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Country code
                  <input required minLength={2} maxLength={2} pattern="[A-Za-z]{2}" value={form.countryCode} onChange={(event) => updateForm('countryCode', event.target.value.toUpperCase())} placeholder="IN" className={`${inputClassName} uppercase`} />
                </label>
              </div>
              <section className="space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/20">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Branch login account</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    Set the name, email, and password this branch administrator will use to sign in.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Admin name <span className="text-rose-500">*</span>
                    <input required maxLength={100} value={form.adminName} onChange={(event) => updateForm('adminName', event.target.value)} placeholder="Branch administrator" className={inputClassName} />
                  </label>
                  <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Login email <span className="text-rose-500">*</span>
                    <input required type="email" maxLength={254} autoComplete="off" value={form.adminEmail} onChange={(event) => updateForm('adminEmail', event.target.value)} placeholder="manager@example.com" className={inputClassName} />
                  </label>
                  <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 sm:col-span-2">
                    Login password <span className="text-rose-500">*</span>
                    <input required type="password" minLength={8} maxLength={256} autoComplete="new-password" value={form.adminPassword} onChange={(event) => updateForm('adminPassword', event.target.value)} placeholder="At least 8 characters" className={inputClassName} />
                  </label>
                </div>
              </section>
              <section className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Copy existing menu items</h3>
                  <p className="mt-1 text-xs text-slate-500">Search items from branches you can access and copy selected items into this branch.</p>
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input aria-label="Search menu items" value={menuItemSearch} onChange={(event) => setMenuItemSearch(event.target.value)} placeholder="Search menu item or SKU..." className={`${inputClassName} pl-10`} />
                </div>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-700">
                  {loadingMenuItems && <p className="px-2 py-3 text-xs text-slate-500">Loading menu items...</p>}
                  {!loadingMenuItems && menuItems
                    .filter((item) => `${item.name} ${item.sku} ${item.categoryName}`.toLowerCase().includes(menuItemSearch.trim().toLowerCase()))
                    .map((item) => (
                      <label key={item._id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-900">
                        <input type="checkbox" checked={selectedMenuItemIds.includes(String(item._id))} onChange={(event) => setSelectedMenuItemIds((current) => (
                          event.target.checked ? [...current, String(item._id)] : current.filter((id) => id !== String(item._id))
                        ))} className="h-4 w-4 rounded text-indigo-600" />
                        <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-200">{item.name} <span className="font-normal text-slate-500">· {item.categoryName} · {item.sku} · {item.sourceBranchName}</span></span>
                      </label>
                    ))}
                  {!loadingMenuItems && menuItems.length === 0 && <p className="px-2 py-3 text-xs text-slate-500">No menu items available from your branches.</p>}
                </div>
                <p className="text-[11px] text-slate-500">{selectedMenuItemIds.length} item(s) selected. Matching categories will be created in the new branch automatically.</p>
              </section>
              <div className="flex flex-col-reverse justify-between gap-3 border-t border-slate-100 pt-5 dark:border-slate-800 sm:flex-row sm:items-center">
                <p className="text-xs text-slate-400">This creates a draft only; it won’t enable live sales.</p>
                <div className="flex justify-end gap-2">
                  <button type="button" disabled={saving} onClick={closeCreate} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
                  <button type="submit" disabled={saving} className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
                    {saving ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Creating…</> : <><Plus className="h-4 w-4" /> Create draft</>}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};

export default BranchesPage;
