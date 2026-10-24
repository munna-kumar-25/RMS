import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  isPositive?: boolean;
  comparisonLabel?: string;
  trend?: { value: number; isPositive: boolean };
  description?: string;
  icon: React.ReactNode;
  variant?: 'default' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'violet' | 'sky';
}

const variantStyles = {
  default: {
    bg: 'bg-slate-50 dark:bg-slate-800/60',
    border: 'border-slate-200 dark:border-slate-700',
    iconColor: 'text-slate-600 dark:text-slate-300',
    trendBg: 'bg-slate-100 dark:bg-slate-800',
  },
  indigo: {
    bg: 'bg-indigo-50 dark:bg-indigo-950/40',
    border: 'border-indigo-100 dark:border-indigo-900/60',
    iconColor: 'text-indigo-600 dark:text-indigo-400',
    trendBg: 'bg-indigo-100 dark:bg-indigo-900/50',
  },
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    border: 'border-emerald-100 dark:border-emerald-900/60',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    trendBg: 'bg-emerald-100 dark:bg-emerald-900/50',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    border: 'border-amber-100 dark:border-amber-900/60',
    iconColor: 'text-amber-600 dark:text-amber-400',
    trendBg: 'bg-amber-100 dark:bg-amber-900/50',
  },
  rose: {
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    border: 'border-rose-100 dark:border-rose-900/60',
    iconColor: 'text-rose-600 dark:text-rose-400',
    trendBg: 'bg-rose-100 dark:bg-rose-900/50',
  },
  violet: {
    bg: 'bg-violet-50 dark:bg-violet-950/40',
    border: 'border-violet-100 dark:border-violet-900/60',
    iconColor: 'text-violet-600 dark:text-violet-400',
    trendBg: 'bg-violet-100 dark:bg-violet-900/50',
  },
  sky: {
    bg: 'bg-sky-50 dark:bg-sky-950/40',
    border: 'border-sky-100 dark:border-sky-900/60',
    iconColor: 'text-sky-600 dark:text-sky-400',
    trendBg: 'bg-sky-100 dark:bg-sky-900/50',
  },
};

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  change,
  isPositive = true,
  comparisonLabel = 'vs yesterday',
  icon,
  variant = 'indigo',
  trend,
  description,
}) => {
  const styles = variantStyles[variant];
  const trendValue = trend ? `${trend.value}%` : change;
  const trendIsPositive = trend?.isPositive ?? isPositive;
  const trendLabel = description || comparisonLabel;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {title}
          </span>
          <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1.5 tracking-tight">
            {value}
          </h3>
        </div>

        <div className={`p-2.5 rounded-xl ${styles.bg} ${styles.border} ${styles.iconColor} shrink-0`}>
          {icon}
        </div>
      </div>

      {trendValue && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 font-semibold">
            <span
              className={`flex items-center px-1.5 py-0.5 rounded-md ${trendIsPositive
                  ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40'
                  : 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40'
                }`}
            >
              {trendIsPositive ? (
                <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
              )}
              {trendValue}
            </span>
          </div>

          <span className="text-[11px] text-slate-400 truncate ml-2">
            {trendLabel}
          </span>
        </div>
      )}
    </div>
  );
};

export default StatCard;
