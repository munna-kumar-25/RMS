import React, { useState, useMemo } from 'react';
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  Info,
  CheckCircle2,
  Boxes,
  Flame,
  Receipt,
  ShieldAlert,
  Clock,
  Filter,
} from 'lucide-react';
import { useAppStore } from '../../store/AppStore.tsx';
import { NotificationItem } from '../../types/index.ts';

interface NotificationsPageProps {
  onNavigate: (path: string) => void;
}

export const NotificationsPage: React.FC<NotificationsPageProps> = ({ onNavigate }) => {
  const {
    notifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    activeBranchId,
  } = useAppStore();

  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [unreadOnly, setUnreadOnly] = useState(false);

  // Filter notifications
  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      const matchBranch = !activeBranchId || !n.branchId || n.branchId === activeBranchId;
      const matchCategory =
        selectedCategory === 'ALL' || n.category === selectedCategory;
      const matchUnread = !unreadOnly || !n.isRead;

      return matchBranch && matchCategory && matchUnread;
    });
  }, [notifications, activeBranchId, selectedCategory, unreadOnly]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleNotificationClick = (n: NotificationItem) => {
    markNotificationAsRead(n._id);
    if (n.actionUrl) {
      onNavigate(n.actionUrl);
    }
  };

  const getIcon = (category: string, type: string) => {
    if (category === 'INVENTORY') return <Boxes className="w-4 h-4 text-amber-500" />;
    if (category === 'KOT') return <Flame className="w-4 h-4 text-rose-500" />;
    if (category === 'FINANCE') return <Receipt className="w-4 h-4 text-emerald-500" />;
    return <ShieldAlert className="w-4 h-4 text-indigo-500" />;
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <Bell className="w-6 h-6 text-indigo-600" />
            <span>Corporate Notification Center</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time broadcast stream for critical kitchen bottlenecks, inventory depletion, and financial approvals.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllNotificationsAsRead}
            className="flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-bold transition-colors self-start sm:self-auto"
          >
            <CheckCheck className="w-4 h-4" />
            <span>Mark All Read ({unreadCount})</span>
          </button>
        )}
      </div>

      {/* Filter Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 overflow-x-auto">
          {['ALL', 'INVENTORY', 'KOT', 'FINANCE', 'SYSTEM'].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {cat === 'ALL' ? 'All Alerts' : cat}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="w-4 h-4 text-indigo-600 rounded"
          />
          <span>Unread only</span>
        </label>
      </div>

      {/* Notification List */}
      <div className="space-y-3">
        {filteredNotifications.length === 0 ? (
          <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-800 dark:text-white">All caught up!</p>
            <p className="text-xs text-slate-400 mt-1">No alerts matching your active criteria.</p>
          </div>
        ) : (
          filteredNotifications.map((notif) => (
            <div
              key={notif._id}
              onClick={() => handleNotificationClick(notif)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start justify-between gap-4 ${
                notif.isRead
                  ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-75'
                  : 'bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/60 shadow-xs'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-white dark:bg-slate-800 shadow-2xs shrink-0 mt-0.5">
                  {getIcon(notif.category, notif.type)}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      {notif.title}
                    </h4>
                    {!notif.isRead && (
                      <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
                    )}
                    {notif.branchName && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {notif.branchName}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {notif.message}
                  </p>

                  <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-1">
                    <Clock className="w-3 h-3" />
                    {new Date(notif.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>

              {notif.actionUrl && (
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0">
                  Resolve →
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default NotificationsPage;
