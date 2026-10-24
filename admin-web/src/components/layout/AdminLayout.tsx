import React, { useState } from 'react';
import Sidebar from './Sidebar.tsx';
import TopNavBar from './TopNavBar.tsx';
import CommandPalette from './CommandPalette.tsx';
import NotificationDrawer from './NotificationDrawer.tsx';

interface AdminLayoutProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onOpenCreateRestaurant: () => void;
  onOpenCreateStaff: () => void;
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  currentPath,
  onNavigate,
  onOpenCreateRestaurant,
  onOpenCreateStaff,
  children,
}) => {
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('rms_sidebar_collapsed') === 'true';
  });

  const toggleSidebar = () => {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      localStorage.setItem('rms_sidebar_collapsed', String(next));
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col antialiased">
      {/* Sidebar (Desktop fixed + Mobile drawer) */}
      <Sidebar
        currentPath={currentPath}
        onNavigate={onNavigate}
        onOpenCreateRestaurant={onOpenCreateRestaurant}
        onOpenCreateStaff={onOpenCreateStaff}
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
        isCollapsed={isSidebarCollapsed}
      />

      {/* Main Column (Offset by sidebar width on desktop) */}
      <div className={`${isSidebarCollapsed ? 'md:pl-16' : 'md:pl-64'} flex flex-col flex-1 min-w-0 transition-[padding] duration-200`}>
        {/* Top Navbar */}
        <TopNavBar
          onMobileMenuToggle={() => setMobileSidebarOpen(true)}
          onSidebarToggle={toggleSidebar}
          isSidebarCollapsed={isSidebarCollapsed}
          onNavigate={onNavigate}
        />

        {/* Dynamic Page Content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {children}
        </main>
      </div>

      {/* Global Command Palette (Ctrl + K) */}
      <CommandPalette onNavigate={onNavigate} />

      {/* Global Notifications Drawer */}
      <NotificationDrawer onNavigate={onNavigate} />
    </div>
  );
};

export default AdminLayout;
