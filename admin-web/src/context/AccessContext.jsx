import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { accessContextRequest, selectCompanyRequest } from '../services/access.api.js';
import { accessViewState, holdsPermission } from '../auth/accessGate.js';

const AccessContext = createContext(null);

const empty = {
  user: null,
  activeCompany: null,
  memberships: [],
  branches: [],
  companyPermissions: [],
  authorizationVersion: null,
  accessRevision: null,
  isCompanySuperAdmin: false,
};

export const AccessProvider = ({ children }) => {
  const { status: authStatus } = useAuth();
  const [status, setStatus] = useState('idle');
  const [context, setContext] = useState(empty);
  const [error, setError] = useState('');

  const applyContext = (next) => {
    const branches = next?.branches || [];
    const saved = localStorage.getItem('rms_active_branch_id');
    if (saved && !branches.some((branch) => branch.id === saved)) {
      localStorage.removeItem('rms_active_branch_id');
      localStorage.removeItem('rms_active_branch');
    }
    setContext(next || empty);
  };

  const refresh = useCallback(async (signal) => {
    if (authStatus !== 'authenticated') {
      setStatus('idle');
      setContext(empty);
      setError('');
      return;
    }
    setStatus('loading');
    try {
      const next = await accessContextRequest(signal);
      applyContext(next);
      setError('');
      setStatus('ready');
    } catch (requestError) {
      if (signal?.aborted) return;
      setContext(empty);
      setError('Access context could not be loaded.');
      setStatus('error');
    }
  }, [authStatus]);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const selectCompany = useCallback(async (companyId) => {
    await selectCompanyRequest(companyId);
    await refresh();
  }, [refresh]);

  const branchLists = context.branches.map((branch) => branch.permissions);
  const view = accessViewState({
    status,
    memberships: context.memberships,
    activeCompany: context.activeCompany,
    companyPermissions: context.companyPermissions,
    branches: context.branches,
  });

  const value = useMemo(() => ({
    status,
    view,
    error,
    ...context,
    refresh,
    selectCompany,
    can: (permission) => holdsPermission(context.companyPermissions, branchLists, permission),
  }), [status, view, error, context, refresh, selectCompany, branchLists]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
};

export const useAccess = () => {
  const value = useContext(AccessContext);
  if (!value) throw new Error('useAccess must be used within an AccessProvider');
  return value;
};

export default AccessContext;
