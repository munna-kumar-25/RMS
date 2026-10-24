import React, { useState, useMemo } from 'react';
import {
  LayoutGrid,
  Users,
  CheckCircle2,
  Clock,
  Sparkles,
  Building2,
  DollarSign,
  Coffee,
  RotateCcw,
  Plus,
} from 'lucide-react';
import { useAppStore } from '../../store/AppStore.tsx';
import api from '../../services/api.js';
import { DiningTable, TableStatus } from '../../types/index.ts';
import StatusBadge from '../../components/common/StatusBadge.tsx';

export const FloorPlannerPage: React.FC = () => {
  const { tables, sections, activeBranchId, currentUser, addTable, updateTableStatus } = useAppStore();

  const [selectedSectionId, setSelectedSectionId] = useState<string>('ALL');
  const [isAddingTable, setIsAddingTable] = useState(false);
  const [sectionName, setSectionName] = useState('Main Dining Hall');
  const [tableNumber, setTableNumber] = useState('');
  const [capacity, setCapacity] = useState(4);
  const [formError, setFormError] = useState('');

  // Filter sections by branch
  const branchSections = useMemo(() => {
    if (!activeBranchId) return sections;
    return sections.filter((s) => s.branchId === activeBranchId);
  }, [sections, activeBranchId]);

  // Filter tables by branch & section
  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      const matchBranch = !activeBranchId || t.branchId === activeBranchId;
      const matchSection =
        selectedSectionId === 'ALL' || t.sectionId === selectedSectionId;
      return matchBranch && matchSection;
    });
  }, [tables, activeBranchId, selectedSectionId]);

  // Occupancy metrics
  const totalTables = filteredTables.length;
  const occupiedCount = filteredTables.filter(
    (t) => t.status === 'OCCUPIED' || t.status === 'ORDERED' || t.status === 'BILLED'
  ).length;
  const occupancyRate = totalTables > 0 ? Math.round((occupiedCount / totalTables) * 100) : 0;
  const totalCapacity = filteredTables.reduce((sum, t) => sum + t.capacity, 0);

  const handleStatusChange = async (tableId: string, status: TableStatus) => {
    try {
      await api.patch(`/tables/${tableId}/status`, { status });
      updateTableStatus(tableId, status);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to update table status.');
    }
  };

  const handleCreateTable = async (event: React.FormEvent) => {
    event.preventDefault();
    const branchId = activeBranchId || (currentUser as typeof currentUser & { branchId?: string }).branchId;
    if (!branchId || !tableNumber.trim() || capacity < 1) {
      setFormError('Enter a table number and capacity for the active branch.');
      return;
    }
    try {
      const response = await api.post('/tables', { branchId, sectionName: sectionName.trim() || 'Main Dining Hall', tableNumber: tableNumber.trim().toUpperCase(), capacity: Number(capacity), status: 'AVAILABLE' });
      const saved = response.data?.data || response.data;
      addTable({ ...saved, sectionId: saved.sectionId || saved.sectionName, sectionName: saved.sectionName || sectionName, status: saved.status || 'AVAILABLE' });
      setTableNumber('');
      setIsAddingTable(false);
      setFormError('');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to create table.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <LayoutGrid className="w-6 h-6 text-indigo-600" />
            <span>Interactive Floor & Seating Planner</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Visual table map, live dining occupancy, guest allocation, and turnover monitoring.
          </p>
        </div>
        <button type="button" onClick={() => setIsAddingTable((open) => !open)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm">
          <Plus className="w-4 h-4" />
          <span>Add Table</span>
        </button>
      </div>

      {isAddingTable && (
        <form onSubmit={handleCreateTable} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end p-4 bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/50 rounded-2xl shadow-sm">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Dining section<input value={sectionName} onChange={(event) => setSectionName(event.target.value)} className="mt-1 w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800" placeholder="Main Dining Hall" /></label>
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Table number<input value={tableNumber} onChange={(event) => setTableNumber(event.target.value)} className="mt-1 w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800" placeholder="T-03" required /></label>
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Capacity<input type="number" min="1" max="50" value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} className="mt-1 w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800" /></label>
          <button type="submit" className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">Create seating</button>
        </form>
      )}
      {formError && <p className="text-xs text-rose-600 dark:text-rose-400">{formError}</p>}

      {/* KPI Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Tables Managed
          </span>
          <span className="text-xl font-black text-slate-900 dark:text-white mt-1 block">
            {totalTables}
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Current Floor Occupancy
          </span>
          <span className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1 block">
            {occupancyRate}%
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Active Seating Capacity
          </span>
          <span className="text-xl font-black text-slate-900 dark:text-white mt-1 block">
            {totalCapacity} Covers
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Available Clean Tables
          </span>
          <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
            {filteredTables.filter((t) => t.status === 'AVAILABLE').length}
          </span>
        </div>
      </div>

      {/* Section Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
        <button
          type="button"
          onClick={() => setSelectedSectionId('ALL')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            selectedSectionId === 'ALL'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
          }`}
        >
          All Dining Sections
        </button>
        {branchSections.map((sec) => (
          <button
            key={sec._id}
            type="button"
            onClick={() => setSelectedSectionId(sec._id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              selectedSectionId === sec._id
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
            }`}
          >
            {sec.name}
          </button>
        ))}
      </div>

      {/* Visual Table Nodes Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredTables.map((table) => {
          const isOccupied =
            table.status === 'OCCUPIED' ||
            table.status === 'ORDERED' ||
            table.status === 'BILLED';

          return (
            <div
              key={table._id}
              className={`p-5 rounded-3xl border transition-all space-y-3 ${
                table.status === 'AVAILABLE'
                  ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                  : table.status === 'ORDERED'
                  ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800'
                  : table.status === 'BILLED'
                  ? 'bg-purple-50/50 dark:bg-purple-950/20 border-purple-300 dark:border-purple-800'
                  : table.status === 'NEEDS_CLEANING'
                  ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800'
                  : 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-300 dark:border-indigo-800'
              }`}
            >
              {/* Card Top */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Table {table.tableNumber}
                  </h3>
                  <span className="text-[10px] text-slate-400 font-semibold block">
                    {table.sectionName} • {table.capacity} Seater
                  </span>
                </div>

                <StatusBadge status={table.status} />
              </div>

              {/* Occupancy details */}
              <div className="min-h-[44px] text-xs">
                {isOccupied ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                      <span>Guests Seated:</span>
                      <span className="font-bold">{table.activeGuests || 2} Persons</span>
                    </div>
                    {table.activeOrderAmount && (
                      <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400 font-bold font-mono">
                        <span>Running Tab:</span>
                        <span>₹{table.activeOrderAmount}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">Ready for walk-in or assigned seating.</p>
                )}
              </div>

              {/* Status Action Buttons */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1 text-[11px]">
                {table.status === 'AVAILABLE' && (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(table._id, 'OCCUPIED')}
                    className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors text-center"
                  >
                    Seat Guests
                  </button>
                )}

                {table.status === 'OCCUPIED' && (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(table._id, 'ORDERED')}
                    className="w-full py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors text-center"
                  >
                    Send KOT Order
                  </button>
                )}

                {table.status === 'ORDERED' && (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(table._id, 'BILLED')}
                    className="w-full py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition-colors text-center"
                  >
                    Print Guest Bill
                  </button>
                )}

                {table.status === 'BILLED' && (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(table._id, 'NEEDS_CLEANING')}
                    className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors text-center"
                  >
                    Payment Received
                  </button>
                )}

                {table.status === 'NEEDS_CLEANING' && (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(table._id, 'AVAILABLE')}
                    className="w-full py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl transition-colors text-center flex items-center justify-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Table Sanitized</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FloorPlannerPage;
