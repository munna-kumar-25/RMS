import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { currentUserRequest, loginRequest, logoutRequest } from '../services/auth.api.js';
import { authFailureAction, consumeIntendedPath } from '../auth/sessionGate.js';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [status, setStatus] = useState('initializing');
  const [user, setUser] = useState(null);
  const [branchSelectionRequired, setBranchSelectionRequired] = useState(
    () => window.sessionStorage.getItem('rms:branch-selection-required') === '1'
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;

    currentUserRequest(controller.signal)
      .then((nextUser) => {
        if (ignore) return;
        setUser(nextUser);
        setStatus('authenticated');
      })
      .catch((error) => {
        if (ignore || error.code === 'CANCELLED') return;
        setUser(null);
        setStatus(authFailureAction(error) === 'login' ? 'unauthenticated' : 'unavailable');
      });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [attempt]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setStatus((current) => (current === 'initializing' ? current : 'unauthenticated'));
    };
    window.addEventListener('rms:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('rms:unauthorized', handleUnauthorized);
  }, []);

  const login = useCallback(async (email, password) => {
    const nextUser = await loginRequest(email, password);
    window.history.replaceState(null, '', consumeIntendedPath());
    window.sessionStorage.setItem('rms:branch-selection-required', '1');
    setBranchSelectionRequired(true);
    setUser(nextUser);
    setStatus('authenticated');
    return nextUser;
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    window.sessionStorage.removeItem('rms:branch-selection-required');
    setBranchSelectionRequired(false);
    setUser(null);
    setStatus('unauthenticated');
    window.history.replaceState(null, '', '/');
  }, []);

  const completeBranchSelection = useCallback(() => {
    window.sessionStorage.removeItem('rms:branch-selection-required');
    setBranchSelectionRequired(false);
  }, []);

  const retry = useCallback(() => {
    setStatus('initializing');
    setAttempt((value) => value + 1);
  }, []);

  const value = useMemo(() => ({
    user,
    status,
    isAuthenticated: status === 'authenticated',
    isSuperAdmin: false,
    isBranchAdmin: false,
    branchSelectionRequired,
    completeBranchSelection,
    login,
    logout,
    retry,
  }), [user, status, branchSelectionRequired, completeBranchSelection, login, logout, retry]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
