import React, { useState, useMemo } from 'react';
import {
  Receipt,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  Building2,
  FileText,
} from 'lucide-react';
import { useAppStore } from '../../store/AppStore.tsx';
import { Expense, ExpenseCategory } from '../../types/index.ts';
import api from '../../services/api.js';

interface ExpensesPageProps {
  onOpenAddExpenseModal: () => void;
}

export const ExpensesPage: React.FC<ExpensesPageProps> = ({
  onOpenAddExpenseModal,
}) => {
  const {
    expenses,
    activeBranchId,
    approveExpense,
    rejectExpense,
  } = useAppStore();

  const updateStatus = async (expense: Expense, status: 'APPROVED' | 'REJECTED') => {
    setActionError('');
    setUpdatingExpenseId(expense._id);
    try {
      await api.patch(`/expenses/${expense._id}/status`, { status });
      if (status === 'APPROVED') approveExpense(expense._id);
      else rejectExpense(expense._id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not update the expense status.');
    } finally {
      setUpdatingExpenseId('');
    }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [actionError, setActionError] = useState('');
  const [updatingExpenseId, setUpdatingExpenseId] = useState('');

  // Filter expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter((exp) => {
      const matchBranch = !activeBranchId || exp.branchId === activeBranchId;
      const matchCat =
        selectedCategory === 'ALL' || exp.category === selectedCategory;
      const matchStatus =
        selectedStatus === 'ALL' || exp.status === selectedStatus;
      const matchSearch =
        exp.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        exp.paidTo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        exp.expenseNumber.toLowerCase().includes(searchQuery.toLowerCase());

      return matchBranch && matchCat && matchStatus && matchSearch;
    });
  }, [expenses, activeBranchId, selectedCategory, selectedStatus, searchQuery]);

  // Aggregate metrics
  const totalAmount = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const pendingCount = filteredExpenses.filter((e) => e.status === 'PENDING').length;
  const approvedAmount = filteredExpenses
    .filter((e) => e.status === 'APPROVED')
    .reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <Receipt className="w-6 h-6 text-indigo-600" />
            <span>Operational Expense Management</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Categorized restaurant expenditures, vendor payables, petty cash vouchers, and approval queues.
          </p>
        </div>
        {actionError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{actionError}</p>}

        <button
          type="button"
          onClick={onOpenAddExpenseModal}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-600/20 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Record Expense</span>
        </button>
      </div>

      {/* KPI Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Total Incurred Expenses
          </span>
          <span className="text-xl font-black text-slate-900 dark:text-white font-mono mt-1 block">
            ₹{totalAmount.toLocaleString()}
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Approved & Disbursed
          </span>
          <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-1 block">
            ₹{approvedAmount.toLocaleString()}
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Pending Approval Vouchers
          </span>
          <span className="text-xl font-black text-amber-500 font-mono mt-1 block">
            {pendingCount}
          </span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search title, payee, or expense #..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Categories</option>
            <option value="Raw Material">Raw Material</option>
            <option value="Rent">Rent</option>
            <option value="Electricity">Electricity</option>
            <option value="Salary">Salary</option>
            <option value="Maintenance">Maintenance</option>
            <option value="Transportation">Transportation</option>
            <option value="Marketing">Marketing</option>
            <option value="Miscellaneous">Miscellaneous</option>
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Expense # & Date</th>
                <th className="py-3 px-4">Branch</th>
                <th className="py-3 px-4">Title & Payee</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Method</th>
                <th className="py-3 px-4 text-right">Amount (₹)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Approval Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredExpenses.map((exp) => (
                <tr
                  key={exp._id}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="py-3 px-4">
                    <span className="font-mono font-bold text-slate-900 dark:text-white block">
                      {exp.expenseNumber}
                    </span>
                    <span className="text-[10px] text-slate-400">{exp.date}</span>
                  </td>

                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400 font-medium">
                    {exp.branchName}
                  </td>

                  <td className="py-3 px-4">
                    <span className="font-bold text-slate-900 dark:text-white block">
                      {exp.title}
                    </span>
                    <span className="text-[10px] text-slate-400">Paid to: {exp.paidTo}</span>
                  </td>

                  <td className="py-3 px-4">
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {exp.category}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-slate-500 font-medium">
                    {exp.paymentMethod}
                  </td>

                  <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white text-right">
                    ₹{exp.amount.toLocaleString()}
                  </td>

                  <td className="py-3 px-4">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        exp.status === 'APPROVED'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                          : exp.status === 'PENDING'
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400'
                          : 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400'
                      }`}
                    >
                      {exp.status}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-right">
                    {exp.status === 'PENDING' ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateStatus(exp, 'APPROVED')}
                          disabled={updatingExpenseId === exp._id}
                          className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px] transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => updateStatus(exp, 'REJECTED')}
                          disabled={updatingExpenseId === exp._id}
                          className="px-2 py-1 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-[10px] font-semibold transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">
                        {exp.approvedBy ? `by ${exp.approvedBy}` : 'Processed'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ExpensesPage;
