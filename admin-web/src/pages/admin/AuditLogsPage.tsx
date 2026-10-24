import React, { useState, useMemo, useEffect } from 'react';
import {
  ShieldCheck,
  Search,
  Filter,
  Clock,
  User,
  Building2,
  FileCode2,
} from 'lucide-react';
import { useAppStore } from '../../store/AppStore.tsx';
import { auditLogsRequest } from '../../services/access.api.js';
import { AuditLogItem } from '../../types/index.ts';

interface AuditChange {
  field: string;
  before?: unknown;
  after?: unknown;
}

const parseSnapshot = (value?: string): unknown => {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const flattenSnapshot = (value: unknown, prefix = '', depth = 0): AuditChange[] => {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || depth >= 5) {
    return [{ field: prefix || 'General data', after: value }];
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return [{ field: prefix || 'General data', after: '{}' }];
  return entries.flatMap(([key, child]) => flattenSnapshot(
    child,
    prefix ? `${prefix} / ${key}` : key,
    depth + 1
  ));
};

const compareSnapshots = (before: unknown, after: unknown, prefix = '', depth = 0): AuditChange[] => {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (before === undefined) return flattenSnapshot(after, prefix, depth);
  if (after === undefined) {
    return flattenSnapshot(before, prefix, depth).map(({ field, after: previousValue }) => ({
      field,
      before: previousValue,
    }));
  }
  if (
    before && after
    && typeof before === 'object' && typeof after === 'object'
    && !Array.isArray(before) && !Array.isArray(after)
    && depth < 5
  ) {
    const beforeObject = before as Record<string, unknown>;
    const afterObject = after as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(beforeObject), ...Object.keys(afterObject)])].sort();
    return keys.flatMap((key) => compareSnapshots(
      beforeObject[key],
      afterObject[key],
      prefix ? `${prefix} / ${key}` : key,
      depth + 1
    ));
  }
  return [{ field: prefix || 'Value', before, after }];
};

const formatAuditValue = (value: unknown): string => {
  if (value === undefined) return '—';
  if (value === null) return 'None';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    if (value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))) {
      return value.length ? value.join(', ') : 'None';
    }
    return `${value.length} item${value.length === 1 ? '' : 's'}`;
  }
  if (typeof value === 'object') {
    const serialized = JSON.stringify(value);
    return serialized.length > 120 ? `${serialized.slice(0, 117)}...` : serialized;
  }
  const text = String(value);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
};

const auditChanges = (log: AuditLogItem): AuditChange[] => {
  const before = parseSnapshot(log.oldValue);
  const after = parseSnapshot(log.newValue);
  if (before === undefined) return flattenSnapshot(after);
  if (after === undefined) return flattenSnapshot(before).map(({ field, after: previousValue }) => ({
    field,
    before: previousValue,
  }));
  return compareSnapshots(before, after);
};

export const AuditLogsPage: React.FC = () => {
  const { activeBranchId } = useAppStore();
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>('ALL');

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setLoadError('');
    auditLogsRequest({ limit: 100, ...(activeBranchId ? { branchId: activeBranchId } : {}) }, controller.signal)
      .then((result) => setAuditLogs(result.logs || []))
      .catch((error) => {
        if (error.code === 'CANCELLED') return;
        setLoadError(error instanceof Error ? error.message : 'Could not load audit logs.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [activeBranchId]);

  const filteredLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      const matchMod = selectedModule === 'ALL' || log.module === selectedModule;
      const matchSearch =
        log.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.ipAddress.includes(searchQuery);

      return matchMod && matchSearch;
    });
  }, [auditLogs, selectedModule, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-indigo-600" />
            <span>Immutable Corporate Audit Trail</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Tamper-evident logs of administrative operations, configuration changes, deletions, and security events.
          </p>
        </div>
        {loadError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{loadError}</p>}
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search action, administrator name, or IP..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={selectedModule}
            onChange={(e) => setSelectedModule(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="ALL">All System Modules</option>
            <option value="Branches">Branches</option>
            <option value="Employees">Employees</option>
            <option value="Menu">Menu</option>
            <option value="Inventory">Inventory</option>
            <option value="POS">POS</option>
            <option value="Orders">Orders</option>
            <option value="Accounting">Accounting</option>
            <option value="Settings">Settings</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Timestamp & IP</th>
                <th className="py-3 px-4">Operator</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4">Module</th>
                <th className="py-3 px-4">Action Summary</th>
                <th className="py-3 px-4">General data / Changes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-500">Loading audit logs…</td></tr>
              ) : filteredLogs.length ? filteredLogs.map((log) => (
                <tr
                  key={log._id}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="font-mono text-slate-900 dark:text-white block font-semibold">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                    {log.ipAddress && <span className="font-mono text-[10px] text-slate-400">IP: {log.ipAddress}</span>}
                  </td>

                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="font-bold text-slate-900 dark:text-white block">
                      {log.userName}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold">
                      {log.userRole}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400 font-medium">
                    {log.branchName}
                  </td>

                  <td className="py-3 px-4">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {log.module}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-slate-800 dark:text-slate-200 font-medium max-w-sm">
                    {log.action}
                  </td>

                  <td className="min-w-[320px] max-w-xl px-4 py-3">
                    {(() => {
                      const changes = auditChanges(log);
                      if (!changes.length) {
                        return <span className="text-[10px] italic text-slate-400">No general data recorded</span>;
                      }
                      const visibleChanges = changes.slice(0, 4);
                      const remainingChanges = changes.slice(4);
                      const renderChange = (change: AuditChange) => (
                        <div key={change.field} className="grid grid-cols-[minmax(90px,0.8fr)_minmax(0,1.2fr)] gap-x-3 gap-y-1 border-b border-slate-100 py-1.5 last:border-0 dark:border-slate-800">
                          <span className="break-words font-semibold text-slate-600 dark:text-slate-300">{change.field}</span>
                          <span className="min-w-0">
                            {change.before !== undefined && (
                              <span className="block break-words text-rose-600 dark:text-rose-400">- {formatAuditValue(change.before)}</span>
                            )}
                            {change.after !== undefined && (
                              <span className="block break-words font-semibold text-emerald-700 dark:text-emerald-400">+ {formatAuditValue(change.after)}</span>
                            )}
                          </span>
                        </div>
                      );
                      return (
                        <div className="space-y-1 text-[10px]">
                          {visibleChanges.map(renderChange)}
                          {remainingChanges.length > 0 && (
                            <details className="pt-1">
                              <summary className="cursor-pointer font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400">
                                Show {remainingChanges.length} more field{remainingChanges.length === 1 ? '' : 's'}
                              </summary>
                              <div className="mt-1">{remainingChanges.map(renderChange)}</div>
                            </details>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={6} className="p-8 text-center text-slate-500">No audit events match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AuditLogsPage;
