import React from 'react';
import { ArrowRight, Building2, Check, LogOut, MapPin } from 'lucide-react';

const BranchLoginPage = ({
  branches,
  selectedBranchId,
  onSelectBranch,
  onContinue,
  onLogout,
  user,
}) => (
  <main className="grid min-h-screen place-items-center bg-slate-50 p-4 dark:bg-slate-950">
    <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:p-8">
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
        <Building2 className="h-6 w-6" />
      </div>
      <p className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-300">RMS branch login</p>
      <h1 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">Select your branch</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Signed in as {user?.name || user?.email || 'your account'}. Choose an assigned branch to open its workspace.
      </p>

      <div className="mt-6 space-y-3" role="radiogroup" aria-label="Assigned branches">
        {branches.map((branch) => {
          const selected = selectedBranchId === branch.id;
          return (
            <button
              key={branch.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelectBranch(branch.id)}
              className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left transition ${
                selected
                  ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/15 dark:border-indigo-400 dark:bg-indigo-950/40'
                  : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-indigo-700 dark:hover:bg-slate-800'
              }`}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-indigo-300">
                  <Building2 className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{branch.name}</span>
                  <span className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono">{branch.code}</span>
                    {branch.city && <><span aria-hidden="true">·</span><MapPin className="h-3.5 w-3.5" /><span className="truncate">{branch.city}</span></>}
                  </span>
                </span>
              </span>
              {selected && <Check className="ml-3 h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-300" />}
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
        <button
          type="button"
          disabled={!selectedBranchId}
          onClick={onContinue}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  </main>
);

export default BranchLoginPage;
