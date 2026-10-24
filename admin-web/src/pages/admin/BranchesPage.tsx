import React, { useState, useMemo } from 'react';
import {
  Building2,
  Plus,
  Search,
  MapPin,
  Phone,
  Mail,
  Users,
  DollarSign,
  ShoppingBag,
  ExternalLink,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Filter,
} from 'lucide-react';
import { useAppStore } from '../../store/AppStore.tsx';
import { useAccess } from '../../context/AccessContext.jsx';
import { Branch } from '../../types/index.ts';

interface BranchesPageProps {
  onNavigate: (path: string) => void;
  onOpenWizard: () => void;
}

export const BranchesPage: React.FC<BranchesPageProps> = ({
  onNavigate,
  onOpenWizard,
}) => {
  const { branches, updateBranch, setActiveBranchId } = useAppStore();
  const access = useAccess();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState<string>('ALL');

  // Distinct cities
  const cities = useMemo(() => {
    const set = new Set<string>();
    branches.forEach((b) => {
      if (b.contact?.address?.city) set.add(b.contact.address.city);
    });
    return Array.from(set);
  }, [branches]);

  // Filtered branches
  const filteredBranches = useMemo(() => {
    return branches.filter((b) => {
      const matchSearch =
        b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.contact.address.city.toLowerCase().includes(searchQuery.toLowerCase());

      const matchCity = selectedCity === 'ALL' || b.contact.address.city === selectedCity;

      return matchSearch && matchCity;
    });
  }, [branches, searchQuery, selectedCity]);

  // Summary Metrics
  const totalRevenue = branches.reduce((sum, b) => sum + b.todayRevenue, 0);
  const totalOrders = branches.reduce((sum, b) => sum + b.todayOrders, 0);
  const totalStaff = branches.reduce((sum, b) => sum + b.employeeCount, 0);

  const toggleBranchActive = (branch: Branch) => {
    updateBranch(branch._id, { isActive: !branch.isActive });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <Building2 className="w-6 h-6 text-indigo-600" />
            <span>Corporate Branch Management</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Provision, manage, configure, and inspect individual restaurant locations across territories.
          </p>
        </div>

        {access.can('branches.create') && (
        <button
          type="button"
          onClick={onOpenWizard}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-600/20 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Provision New Branch</span>
        </button>
        )}
      </div>

      {/* Aggregate Overview Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Total Branches
          </span>
          <span className="text-xl font-black text-slate-900 dark:text-white mt-1 block">
            {branches.length}
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Aggregated Revenue
          </span>
          <span className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1 block">
            ₹{totalRevenue.toLocaleString()}
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Today's Orders
          </span>
          <span className="text-xl font-black text-slate-900 dark:text-white mt-1 block">
            {totalOrders}
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Total Staff Deployed
          </span>
          <span className="text-xl font-black text-slate-900 dark:text-white mt-1 block">
            {totalStaff}
          </span>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search branch name, code, or city..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Territories</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Branches Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredBranches.map((branch) => (
          <div
            key={branch._id}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 hover:border-slate-300 dark:hover:border-slate-700 transition-all"
          >
            {/* Card Header */}
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-md">
                    {branch.code}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      branch.isActive
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                        : 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400'
                    }`}
                  >
                    {branch.isActive ? 'Active' : 'Suspended'}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1.5">
                  {branch.name}
                </h3>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {branch.contact.address.street}, {branch.contact.address.city},{' '}
                    {branch.contact.address.state}
                  </span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => toggleBranchActive(branch)}
                className="text-slate-400 hover:text-slate-600 p-1"
                title={branch.isActive ? 'Suspend Branch' : 'Activate Branch'}
              >
                {branch.isActive ? (
                  <ToggleRight className="w-6 h-6 text-emerald-600" />
                ) : (
                  <ToggleLeft className="w-6 h-6 text-slate-400" />
                )}
              </button>
            </div>

            {/* Performance KPIs */}
            <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
              <div>
                <span className="text-[10px] text-slate-400 font-semibold block">Today's Sales</span>
                <span className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                  ₹{branch.todayRevenue.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-semibold block">Orders</span>
                <span className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                  {branch.todayOrders}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-semibold block">Staff</span>
                <span className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                  {branch.employeeCount}
                </span>
              </div>
            </div>

            {/* Details & Action Bar */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <div className="text-slate-400 space-y-0.5">
                <div className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  <span>{branch.contact.phone}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  <span>{branch.contact.email}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveBranchId(branch._id);
                    onNavigate('/admin/dashboard');
                  }}
                  className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-lg transition-colors"
                  title="Switch application scope to this branch"
                >
                  Set Scope
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate(`/admin/branches/${branch._id}`)}
                  className="flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] rounded-lg transition-colors shadow-2xs"
                >
                  <span>Inspect</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BranchesPage;
