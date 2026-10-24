import React, { useState, useRef, useEffect } from 'react';
import { useBranch } from '../../hooks/useBranch.js';
import { useAuth } from '../../hooks/useAuth.js';
import {
  Building2,
  Globe,
  Check,
  ChevronDown,
  Search,
  Lock,
  PlusCircle,
  RefreshCw,
} from 'lucide-react';

export const BranchSwitcher = ({ onOpenCreateModal }) => {
  const { isSuperAdmin } = useAuth();
  const {
    branches,
    activeBranch,
    setActiveBranch,
    refreshBranches,
    isLoading,
    isGlobalView,
  } = useBranch();

  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Filter branches by search term
  const filteredBranches = branches.filter((branch) => {
    const term = searchTerm.toLowerCase();
    return (
      branch.name.toLowerCase().includes(term) ||
      branch.code.toLowerCase().includes(term) ||
      branch.contact?.address?.city?.toLowerCase().includes(term)
    );
  });

  // -------------------------------------------------------------
  // Case A: Branch Staff (Locked Badge)
  // -------------------------------------------------------------
  if (!isSuperAdmin) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 font-medium select-none shadow-sm">
        <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
        <span className="font-semibold truncate max-w-[160px]">
          {activeBranch?.name || 'Assigned Branch'}
        </span>
        {activeBranch?.code && (
          <span className="text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded">
            {activeBranch.code}
          </span>
        )}
        <span title="Branch scope is fixed to your assigned profile">
          <Lock className="w-3.5 h-3.5 text-slate-400 ml-1" />
        </span>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Case B: SUPER_ADMIN (Interactive Switcher Dropdown)
  // -------------------------------------------------------------
  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Dropdown Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2.5 px-3.5 py-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm transition-all text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        {isGlobalView ? (
          <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        ) : (
          <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
        )}

        <div className="flex flex-col text-left leading-tight">
          <span className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">
            Active Scope
          </span>
          <span className="font-semibold truncate max-w-[180px]">
            {isGlobalView ? 'All Branches (Global)' : activeBranch.name}
          </span>
        </div>

        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ml-1 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header & Refresh */}
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-850">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Switch Branch Scope
            </span>
            <button
              type="button"
              onClick={refreshBranches}
              disabled={isLoading}
              className="text-slate-400 hover:text-indigo-600 p-1 rounded transition-colors"
              title="Refresh branches list"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Search Input */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-800">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search branches..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-100 dark:bg-slate-800 border-none rounded-md text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                autoFocus
              />
            </div>
          </div>

          {/* Branch List */}
          <div className="max-h-60 overflow-y-auto py-1">
            {/* Global View Option */}
            <button
              type="button"
              onClick={() => {
                setActiveBranch(null);
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-medium transition-colors ${
                isGlobalView
                  ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Globe className="w-4 h-4 text-emerald-600" />
                <div className="flex flex-col text-left">
                  <span>All Branches (Global View)</span>
                  <span className="text-[10px] text-slate-400">
                    Aggregated analytics across system
                  </span>
                </div>
              </div>
              {isGlobalView && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
            </button>

            <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

            {/* Branch Items */}
            {filteredBranches.length > 0 ? (
              filteredBranches.map((branch) => {
                const isSelected = activeBranch?._id === branch._id;
                return (
                  <button
                    key={branch._id}
                    type="button"
                    onClick={() => {
                      setActiveBranch(branch);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2 text-xs transition-colors ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Building2 className="w-4 h-4 text-indigo-500 shrink-0" />
                      <div className="flex flex-col text-left truncate">
                        <span className="truncate">{branch.name}</span>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                          <span className="font-mono">{branch.code}</span>
                          {branch.contact?.address?.city && (
                            <>
                              <span>•</span>
                              <span>{branch.contact.address.city}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-indigo-600 shrink-0 ml-2" />}
                  </button>
                );
              })
            ) : (
              <div className="py-6 text-center text-xs text-slate-400">
                No branches found matching "{searchTerm}"
              </div>
            )}
          </div>

          {/* Footer: Add Branch Modal Button */}
          {onOpenCreateModal && (
            <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-850">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenCreateModal();
                }}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Provision New Branch</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BranchSwitcher;
