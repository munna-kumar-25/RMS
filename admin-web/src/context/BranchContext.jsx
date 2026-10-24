import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth.js';

export const BranchContext = createContext(null);

export const BranchProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();

  const [branches, setBranches] = useState([]);
  const [activeBranch, setActiveBranchState] = useState(() => {
    try {
      const saved = localStorage.getItem('rms_active_branch');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Sync activeBranch to localStorage whenever it changes
   */
  const setActiveBranch = useCallback((branch) => {
    if (branch && branch._id) {
      setActiveBranchState(branch);
      localStorage.setItem('rms_active_branch', JSON.stringify(branch));
      localStorage.setItem('rms_active_branch_id', branch._id);
    } else {
      // Global View (SUPER_ADMIN only)
      setActiveBranchState(null);
      localStorage.removeItem('rms_active_branch');
      localStorage.removeItem('rms_active_branch_id');
    }
  }, []);

  /**
   * Fetch/refresh branches list from backend API
   */
  const refreshBranches = useCallback(async () => {
    setBranches([]);
  }, []);

  // Initial fetch on authentication change
  useEffect(() => {
    if (isAuthenticated) {
      refreshBranches();
    } else {
      setBranches([]);
      setActiveBranch(null);
    }
  }, [isAuthenticated, refreshBranches, setActiveBranch]);

  const value = useMemo(
    () => ({
      branches,
      activeBranch,
      setActiveBranch,
      refreshBranches,
      isLoading,
      error,
      isGlobalView: !activeBranch,
    }),
    [branches, activeBranch, setActiveBranch, refreshBranches, isLoading, error]
  );

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
};

export default BranchContext;
