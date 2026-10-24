import React, { useState, useMemo } from 'react';
import {
  Flame,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  Check,
  Send,
  Building2,
} from 'lucide-react';
import { useAppStore } from '../../store/AppStore.tsx';
import { KOT, KOTStatus } from '../../types/index.ts';

export const KitchenKdsPage: React.FC = () => {
  const { kots, updateKOTStatus, activeBranchId } = useAppStore();

  const [filterPriority, setFilterPriority] = useState<string>('ALL');
  const [actionError, setActionError] = useState('');

  const advanceKOT = async (id: string, status: KOTStatus) => {
    setActionError('');
    try {
      await updateKOTStatus(id, status);
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : 'Could not update the kitchen ticket.');
    }
  };

  // Filter KOTs
  const branchKots = useMemo(() => {
    return kots.filter((k) => {
      const matchBranch = !activeBranchId || k.branchId === activeBranchId;
      const matchPriority =
        filterPriority === 'ALL' || k.priority === filterPriority;
      return matchBranch && matchPriority;
    });
  }, [kots, activeBranchId, filterPriority]);

  const columns: { id: KOTStatus; title: string; color: string }[] = [
    { id: 'PENDING', title: 'Pending Tickets', color: 'border-amber-400 text-amber-500' },
    { id: 'PREPARING', title: 'In Kitchen (Cooking)', color: 'border-indigo-500 text-indigo-500' },
    { id: 'READY', title: 'Ready for Pickup', color: 'border-emerald-500 text-emerald-500' },
    { id: 'SERVED', title: 'Served / Completed', color: 'border-slate-300 text-slate-400' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <Flame className="w-6 h-6 text-indigo-600" />
            <span>Kitchen Display System (KDS) Live Screen</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time station order pipeline, prep timing alarms, and chef dispatch queue.
          </p>
        </div>

        {actionError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{actionError}</p>}

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-semibold">Priority:</span>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Priorities</option>
            <option value="URGENT">Urgent Tickets Only</option>
            <option value="HIGH">High Priority</option>
            <option value="NORMAL">Normal Priority</option>
          </select>
        </div>
      </div>

      {/* 4 Column Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {columns.map((col) => {
          const colKots = branchKots.filter((k) => k.status === col.id);

          return (
            <div
              key={col.id}
              className="bg-slate-100/70 dark:bg-slate-900/60 rounded-2xl p-3 space-y-3 border border-slate-200 dark:border-slate-800 min-h-[500px]"
            >
              {/* Column Title */}
              <div className={`flex items-center justify-between pb-2 border-b-2 ${col.color}`}>
                <span className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">
                  {col.title}
                </span>
                <span className="text-xs font-black px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-2xs">
                  {colKots.length}
                </span>
              </div>

              {/* Tickets List */}
              <div className="space-y-3">
                {colKots.map((kot) => {
                  const isOverdue = kot.elapsedMinutes > 20;
                  const isWarning = kot.elapsedMinutes > 12 && kot.elapsedMinutes <= 20;

                  return (
                    <div
                      key={kot._id}
                      className="p-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xs space-y-3"
                    >
                      {/* Ticket Header */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-black text-xs text-slate-900 dark:text-white">
                              #{kot.kotNumber}
                            </span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                kot.priority === 'URGENT'
                                  ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 animate-pulse'
                                  : kot.priority === 'HIGH'
                                  ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {kot.priority}
                            </span>
                          </div>

                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mt-0.5 block">
                            Table {kot.tableNumber || 'N/A'} • Order #{kot.orderNumber}
                          </span>
                        </div>

                        {/* Timer Badge */}
                        <div
                          className={`flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                            isOverdue
                              ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/50'
                              : isWarning
                              ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/50'
                              : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50'
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          <span>{kot.elapsedMinutes}m</span>
                        </div>
                      </div>

                      {/* Items */}
                      <div className="divide-y divide-slate-100 dark:divide-slate-700/60 text-xs">
                        {kot.items.map((item, idx) => (
                          <div key={idx} className="py-1.5 flex items-start justify-between">
                            <div className="pr-2">
                              <span className="font-bold text-slate-800 dark:text-slate-200">
                                {item.name}
                              </span>
                              {item.notes && (
                                <span className="text-[10px] text-rose-500 dark:text-rose-400 block italic">
                                  ★ {item.notes}
                                </span>
                              )}
                            </div>
                            <span className="font-mono font-black text-xs text-indigo-600 dark:text-indigo-400 shrink-0">
                              x{item.quantity}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Advance Stage Actions */}
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-end gap-1">
                        {kot.status === 'PENDING' && (
                          <button
                            type="button"
                            onClick={() => advanceKOT(kot._id, 'PREPARING')}
                            className="w-full flex items-center justify-center gap-1 py-1.5 px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors"
                          >
                            <Play className="w-3 h-3" />
                            <span>Start Cooking</span>
                          </button>
                        )}

                        {kot.status === 'PREPARING' && (
                          <button
                            type="button"
                            onClick={() => advanceKOT(kot._id, 'READY')}
                            className="w-full flex items-center justify-center gap-1 py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors"
                          >
                            <Check className="w-3 h-3" />
                            <span>Mark Ready</span>
                          </button>
                        )}

                        {kot.status === 'READY' && (
                          <button
                            type="button"
                            onClick={() => advanceKOT(kot._id, 'SERVED')}
                            className="w-full flex items-center justify-center gap-1 py-1.5 px-2.5 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors"
                          >
                            <Send className="w-3 h-3" />
                            <span>Serve to Guest</span>
                          </button>
                        )}

                        {kot.status === 'SERVED' && (
                          <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1 py-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            Completed
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default KitchenKdsPage;
