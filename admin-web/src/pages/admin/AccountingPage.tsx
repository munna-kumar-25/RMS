import React, { useState, useMemo } from 'react';
import {
  Calculator,
  Search,
  Filter,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownLeft,
  Building2,
  FileSpreadsheet,
} from 'lucide-react';
import { useAppStore } from '../../store/AppStore.tsx';
import { AccountingTransaction, LedgerAccount } from '../../types/index.ts';
import { createXlsxBuffer } from '../../utils/xlsxExport.js';

export const AccountingPage: React.FC = () => {
  const { ledgers, transactions, activeBranchId } = useAppStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [exportError, setExportError] = useState('');

  // Filter by branch
  const branchLedgers = useMemo(() => {
    if (!activeBranchId) return ledgers;
    return ledgers.filter((l) => l.branchId === activeBranchId);
  }, [ledgers, activeBranchId]);

  const branchTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const matchBranch = !activeBranchId || t.branchId === activeBranchId;
      const matchType = selectedType === 'ALL' || t.type === selectedType;
      const matchSearch =
        t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.transactionId.toLowerCase().includes(searchQuery.toLowerCase());

      return matchBranch && matchType && matchSearch;
    });
  }, [transactions, activeBranchId, selectedType, searchQuery]);

  // Aggregate financials
  const totalDebits = branchTransactions.reduce((sum, t) => sum + t.debit, 0);
  const totalCredits = branchTransactions.reduce((sum, t) => sum + t.credit, 0);
  const netCashFlow = totalCredits - totalDebits;

  const exportStatement = () => {
    setExportError('');
    try {
      const rows = [
        ['Transaction ID', 'Date', 'Branch', 'Type', 'Description', 'Debit', 'Credit', 'Payment method', 'Balance'],
        ...branchTransactions.map((transaction) => [
          transaction.transactionId,
          transaction.date,
          transaction.branchName,
          transaction.type,
          transaction.description,
          transaction.debit,
          transaction.credit,
          transaction.paymentMethod,
          transaction.balance,
        ]),
      ];
      const file = new Blob([createXlsxBuffer(rows)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `rms-accounting-statement-${new Date().toISOString().slice(0, 10)}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Could not export the accounting statement.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <Calculator className="w-6 h-6 text-indigo-600" />
            <span>Accounting & Double-Entry Ledger</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            General ledger accounts, transactional journals, cash reconciliations, and P&L financial statements.
          </p>
        </div>

        <button
          type="button"
          onClick={exportStatement}
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors"
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <span>Export Excel Statement</span>
        </button>
      </div>
      {exportError && <p role="alert" className="text-xs text-rose-600">{exportError}</p>}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Total Inflow / Credits (Sales)
          </span>
          <div className="flex items-center gap-1.5 mt-1">
            <ArrowDownLeft className="w-5 h-5 text-emerald-600" />
            <span className="text-xl font-black text-slate-900 dark:text-white font-mono">
              ₹{totalCredits.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Total Outflow / Debits (Expenses & Bills)
          </span>
          <div className="flex items-center gap-1.5 mt-1">
            <ArrowUpRight className="w-5 h-5 text-rose-600" />
            <span className="text-xl font-black text-slate-900 dark:text-white font-mono">
              ₹{totalDebits.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Net Ledger Cash Flow
          </span>
          <div className="flex items-center gap-1.5 mt-1">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            <span className="text-xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
              ₹{netCashFlow.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* General Ledger Accounts Strip */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Chart of Accounts
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {branchLedgers.map((account) => (
            <div
              key={account._id}
              className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-1 shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {account.accountCode}
                </span>
                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                  {account.accountType}
                </span>
              </div>
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                {account.accountName}
              </h4>
              <span className="text-sm font-mono font-black text-slate-900 dark:text-white block">
                ₹{account.balance.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Search & Type Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search description or transaction ID..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Transaction Types</option>
            <option value="SALE">Sales (Inflow)</option>
            <option value="EXPENSE">Operational Expenses</option>
            <option value="PURCHASE">Raw Material Purchases</option>
            <option value="PAYROLL">Staff Salaries</option>
            <option value="TAX_PAYMENT">GST Remittances</option>
          </select>
        </div>
      </div>

      {/* Transaction Journal Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Txn ID & Date</th>
                <th className="py-3 px-4">Branch</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Narration / Description</th>
                <th className="py-3 px-4 text-right">Debit (₹)</th>
                <th className="py-3 px-4 text-right">Credit (₹)</th>
                <th className="py-3 px-4">Method</th>
                <th className="py-3 px-4 text-right">Running Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {branchTransactions.map((txn) => (
                <tr
                  key={txn._id}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="py-3 px-4">
                    <span className="font-mono font-bold text-slate-900 dark:text-white block">
                      {txn.transactionId}
                    </span>
                    <span className="text-[10px] text-slate-400">{txn.date}</span>
                  </td>

                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400 font-medium">
                    {txn.branchName}
                  </td>

                  <td className="py-3 px-4">
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                        txn.type === 'SALE'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {txn.type}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-slate-800 dark:text-slate-200 max-w-xs truncate">
                    {txn.description}
                  </td>

                  <td className="py-3 px-4 font-mono font-bold text-rose-600 dark:text-rose-400 text-right">
                    {txn.debit > 0 ? `₹${txn.debit.toLocaleString()}` : '-'}
                  </td>

                  <td className="py-3 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400 text-right">
                    {txn.credit > 0 ? `₹${txn.credit.toLocaleString()}` : '-'}
                  </td>

                  <td className="py-3 px-4 text-slate-500 font-medium">
                    {txn.paymentMethod}
                  </td>

                  <td className="py-3 px-4 font-mono font-black text-slate-900 dark:text-white text-right">
                    ₹{txn.balance.toLocaleString()}
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

export default AccountingPage;
