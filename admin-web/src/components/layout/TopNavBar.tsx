import React, { useState, useRef, useEffect } from 'react';
import {
  Menu as MenuIcon,
  Search,
  Building2,
  Globe,
  Check,
  ChevronDown,
  Bell,
  Sun,
  Moon,
  User,
  Shield,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useAppStore } from '../../store/AppStore.tsx';
import { useAuth } from '../../hooks/useAuth.js';
import { useAccess } from '../../context/AccessContext.jsx';
import { allowAggregate } from '../../auth/accessGate.js';
import BackendConnectionStatus from '../common/BackendConnectionStatus.jsx';

interface TopNavBarProps {
  onMobileMenuToggle: () => void;
  onSidebarToggle: () => void;
  isSidebarCollapsed: boolean;
  onNavigate: (path: string) => void;
}

export const TopNavBar: React.FC<TopNavBarProps> = ({
  onMobileMenuToggle,
  onSidebarToggle,
  isSidebarCollapsed,
  onNavigate,
}) => {
  const { logout } = useAuth();
  const access = useAccess();
  const {
    activeBranchId,
    setActiveBranchId,
    theme,
    toggleTheme,
    notifications,
    setCommandPaletteOpen,
    setNotificationDrawerOpen,
    currentUser,
  } = useAppStore();

  const branches = access.branches.filter((branch) => branch.setupStatus !== 'archived');
  const selectedBranch = branches.find((branch) => branch.id === activeBranchId) || null;
  const aggregate = allowAggregate(
    access.companyPermissions,
    branches.map((branch) => branch.permissions)
  );
  const usableMemberships = access.memberships.filter((item) => item.status === 'active' && item.company.status === 'active');

  const [isBranchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [isProfileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const branchRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const unreadNotifCount = notifications.filter((n) => !n.isRead).length;

  // Handle outside click closures
  useEffect(() => {
    if (access.status !== 'ready') return;
    if (activeBranchId && !branches.some((branch) => branch.id === activeBranchId)) {
      setActiveBranchId(aggregate ? null : (branches[0]?.id || null));
      return;
    }
    if (!aggregate && !activeBranchId && branches[0]) {
      setActiveBranchId(branches[0].id);
    }
  }, [access.status, activeBranchId, aggregate, branches, setActiveBranchId]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (branchRef.current && !branchRef.current.contains(e.target as Node)) {
        setBranchDropdownOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <header className="sticky top-0 z-30 min-h-16 h-auto bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 md:px-6 py-2 flex flex-wrap items-center justify-between gap-y-2">
      {/* Left: Mobile hamburger & Global Search */}
      <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-[12rem]">
        <button
          type="button"
          onClick={onSidebarToggle}
          className="hidden md:inline-flex p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          title={isSidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          aria-label={isSidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        >
          {isSidebarCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
        </button>
        <button
          type="button"
          onClick={onMobileMenuToggle}
          className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 md:hidden rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <MenuIcon className="w-5 h-5" />
        </button>

        {/* Global Search Bar (Trigger for Ctrl + K) */}
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="flex items-center gap-2.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200/70 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl text-slate-400 text-xs w-full max-w-xs transition-colors text-left"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="truncate hidden sm:inline">Search branches, orders, staff...</span>
          <span className="truncate sm:hidden">Search...</span>
          <kbd className="ml-auto hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-slate-500 shadow-2xs">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: Branch Selector, Notifications, Dark Mode, Profile */}
      <div className="flex items-center justify-end flex-wrap gap-2.5 max-w-full">
        <BackendConnectionStatus />
        {usableMemberships.length > 1 && (
          <label className="hidden sm:flex items-center gap-2 text-[11px] font-semibold text-slate-500">
            Company
            <select
              className="px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200"
              value={access.activeCompany?.id || ''}
              onChange={(event) => {
                access.selectCompany(event.target.value).catch(() => undefined);
              }}
            >
              {usableMemberships.map((membership) => (
                <option key={membership.company.id} value={membership.company.id}>{membership.company.name}</option>
              ))}
            </select>
          </label>
        )}
        {/* Branch scope selector. Options come from the access context. */}
        <div className="relative" ref={branchRef}>
          <button
            type="button"
            onClick={() => setBranchDropdownOpen((prev) => !prev)}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 transition-all shadow-2xs"
          >
            {selectedBranch ? (
              <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            ) : (
              <Globe className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            )}

            <span className="max-w-[130px] truncate">
              {selectedBranch ? selectedBranch.name : (branches.length ? 'All Branches' : 'No accessible branches')}
            </span>

            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-0.5" />
          </button>

          {/* Branch Dropdown Menu */}
          {isBranchDropdownOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Select Active Branch Scope
              </div>

              {aggregate && (
              <button
                type="button"
                onClick={() => {
                  setActiveBranchId(null);
                  setBranchDropdownOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2 text-xs transition-colors ${activeBranchId === null
                  ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
              >
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-emerald-600" />
                  <div className="text-left">
                    <span className="block font-semibold">All Branches</span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      Aggregate read of {branches.length} accessible {branches.length === 1 ? 'branch' : 'branches'}
                    </span>
                  </div>
                </div>
                {activeBranchId === null && <Check className="w-4 h-4 text-indigo-600" />}
              </button>
              )}

              {branches.length === 0 && (
                <p className="px-3.5 py-3 text-xs text-slate-500">No accessible branches.</p>
              )}

              <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

              {/* Individual Branches list */}
              {branches.map((b) => {
                const isSelected = activeBranchId === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      setActiveBranchId(b.id);
                      setBranchDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2 text-xs transition-colors ${isSelected
                      ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Building2 className="w-4 h-4 text-indigo-500 shrink-0" />
                      <div className="text-left truncate">
                        <span className="block font-semibold truncate">{b.name}</span>
                        <span className="text-[10px] font-mono text-slate-400">{b.code}{b.setupStatus && b.setupStatus !== 'active' ? ` · ${b.setupStatus.replaceAll('_', ' ')}` : ''}</span>
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-indigo-600 shrink-0 ml-2" />}
                  </button>
                );
              })}

            </div>
          )}
        </div>

        {/* Notifications Bell */}
        <button
          type="button"
          onClick={() => setNotificationDrawerOpen(true)}
          className="relative p-2 rounded-xl text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Open Notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadNotifCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900 animate-pulse" />
          )}
        </button>

        {/* Dark Mode Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Profile Avatar Dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileDropdownOpen((prev) => !prev)}
            className="flex items-center gap-2 p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
              {(currentUser.name || 'U').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
            </div>
          </button>

          {isProfileDropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  {currentUser.name}
                </span>
                <span className="text-[11px] text-slate-400 block truncate">
                  {currentUser.email}
                </span>
                <span className="mt-1 inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold">
                  Signed in
                </span>
              </div>

              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    onNavigate('/admin/profile');
                  }}
                  className="w-full px-4 py-2 text-xs text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                >
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>Profile & Account</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    onNavigate('/admin/settings');
                  }}
                  className="w-full px-4 py-2 text-xs text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                >
                  <Shield className="w-3.5 h-3.5 text-slate-400" />
                  <span>System Settings</span>
                </button>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    logout().catch(() => {});
                  }}
                  className="w-full px-4 py-2 text-xs text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopNavBar;
