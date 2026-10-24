import React, { useState } from 'react';
import {
  X,
  Bell,
  CheckCircle2,
  AlertTriangle,
  Info,
  ShieldAlert,
  CheckCheck,
} from 'lucide-react';
import { useAppStore } from '../../store/AppStore.tsx';

interface NotificationDrawerProps {
  onNavigate: (path: string) => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({ onNavigate }) => {
  const {
    isNotificationDrawerOpen,
    setNotificationDrawerOpen,
    notifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
  } = useAppStore();

  const [activeFilter, setActiveFilter] = useState<'ALL' | 'INVENTORY' | 'KOT' | 'FINANCE'>('ALL');

  if (!isNotificationDrawerOpen) return null;

  const filteredNotifications = notifications.filter((n) => {
    if (activeFilter === 'ALL') return true;
    return n.category === activeFilter;
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'ALERT':
        return <ShieldAlert className="w-4 h-4 text-rose-500" />;
      case 'WARNING':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'SUCCESS':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      default:
        return <Info className="w-4 h-4 text-indigo-500" />;
    }
  };

  const handleActionClick = (notif: any) => {
    markNotificationAsRead(notif._id);
    setNotificationDrawerOpen(false);
    if (notif.actionUrl) {
      onNavigate(notif.actionUrl);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-850">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Notifications
                </h3>
                <span className="text-[11px] text-slate-400">
                  Real-time branch alerts & activity
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={markAllNotificationsAsRead}
                className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-xs font-semibold flex items-center gap-1"
                title="Mark all as read"
              >
                <CheckCheck className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setNotificationDrawerOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900 overflow-x-auto">
            {(['ALL', 'INVENTORY', 'KOT', 'FINANCE'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveFilter(cat)}
                className={`px-3 py-1 text-[11px] font-semibold rounded-full transition-colors whitespace-nowrap ${
                  activeFilter === cat
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                {cat === 'ALL' ? 'All Alerts' : cat}
              </button>
            ))}
          </div>

          {/* Notifications Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 divide-y divide-slate-100 dark:divide-slate-800/60">
            {filteredNotifications.length > 0 ? (
              filteredNotifications.map((notif) => (
                <div
                  key={notif._id}
                  onClick={() => handleActionClick(notif)}
                  className={`pt-3 first:pt-0 cursor-pointer group transition-colors rounded-xl p-2.5 ${
                    notif.isRead
                      ? 'opacity-80 hover:bg-slate-50 dark:hover:bg-slate-850'
                      : 'bg-indigo-50/50 dark:bg-indigo-950/20 hover:bg-indigo-50 dark:hover:bg-indigo-950/40'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">{getIcon(notif.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {notif.title}
                        </span>
                        {!notif.isRead && (
                          <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                        {notif.message}
                      </p>
                      <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-400">
                        {notif.branchName && (
                          <span className="font-semibold text-slate-500 dark:text-slate-400">
                            {notif.branchName}
                          </span>
                        )}
                        <span>•</span>
                        <span>{new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-16 text-center text-xs text-slate-400">
                No notifications in this category.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationDrawer;
