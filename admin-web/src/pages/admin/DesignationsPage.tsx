import React from 'react';
import { Shield } from 'lucide-react';
import AccessAdminPanel from './AccessAdminPanel.jsx';

interface DesignationsPageProps {
  openCreateRequestKey?: string;
}

export const DesignationsPage: React.FC<DesignationsPageProps> = ({ openCreateRequestKey = '' }) => (
  <div className="space-y-6">
    <header>
      <h1 className="flex items-center gap-2.5 text-xl font-black text-slate-900 dark:text-white md:text-2xl">
        <Shield className="h-6 w-6 text-indigo-600" />
        Designations
      </h1>
      <p className="mt-1 text-xs text-slate-500">
        Create and configure custom company or branch roles for your staff.
      </p>
    </header>
    <AccessAdminPanel tab="roles" creationMode="dialog" openCreateRequestKey={openCreateRequestKey} />
  </div>
);

export default DesignationsPage;
