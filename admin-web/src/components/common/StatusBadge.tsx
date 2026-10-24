import React from 'react';

type BadgeType =
  | 'order'
  | 'table'
  | 'inventory'
  | 'expense'
  | 'role'
  | 'kot'
  | 'food';

interface StatusBadgeProps {
  status: string;
  type?: BadgeType;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  className = '',
}) => {
  const normalized = status.toUpperCase().replace(/\s+/g, '_');

  let colorClasses = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  let dotColor = 'bg-slate-400';

  // Specific Status Mappings
  switch (normalized) {
    // Green / Success
    case 'ACTIVE':
    case 'PAID':
    case 'AVAILABLE':
    case 'IN_STOCK':
    case 'APPROVED':
    case 'SERVED':
    case 'READY':
    case 'VEG':
      colorClasses = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      dotColor = 'bg-emerald-500';
      break;

    // Amber / Warning
    case 'OPEN':
    case 'ORDERED':
    case 'OCCUPIED':
    case 'LOW_STOCK':
    case 'PENDING':
    case 'PREPARING':
    case 'BILLED':
    case 'ON_LEAVE':
      colorClasses = 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      dotColor = 'bg-amber-500';
      break;

    // Red / Danger
    case 'INACTIVE':
    case 'CANCELLED':
    case 'OUT_OF_STOCK':
    case 'REJECTED':
    case 'NON_VEG':
    case 'NEEDS_CLEANING':
      colorClasses = 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200 dark:border-rose-800';
      dotColor = 'bg-rose-500';
      break;

    // Blue / Info
    case 'RESERVED':
    case 'SUPER_ADMIN':
    case 'BRANCH_ADMIN':
    case 'VEGAN':
    case 'BEVERAGE':
      colorClasses = 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
      dotColor = 'bg-indigo-500';
      break;

    case 'CASHIER':
    case 'WAITER':
    case 'KITCHEN_STAFF':
    case 'ACCOUNTANT':
      colorClasses = 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 border-sky-200 dark:border-sky-800';
      dotColor = 'bg-sky-500';
      break;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colorClasses} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      <span>{status.replace(/_/g, ' ')}</span>
    </span>
  );
};

export default StatusBadge;
