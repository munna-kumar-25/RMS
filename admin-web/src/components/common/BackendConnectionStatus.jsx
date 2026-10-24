import React, { useCallback, useEffect, useState } from 'react';
import { fetchBackendConnection } from '../../services/health.api.js';

const LABELS = {
  connecting: 'Connecting',
  connected: 'Connected',
  'backend-unavailable': 'Backend unavailable',
  'database-unavailable': 'Database unavailable',
};

const DOT = {
  connecting: 'bg-amber-400',
  connected: 'bg-emerald-500',
  'backend-unavailable': 'bg-rose-500',
  'database-unavailable': 'bg-amber-500',
};

export const BackendConnectionStatus = () => {
  const [state, setState] = useState('connecting');

  const check = useCallback((signal) => {
    setState('connecting');
    return fetchBackendConnection(signal)
      .then((result) => {
        if (!signal.aborted) setState(result.state);
      })
      .catch((error) => {
        if (error.code !== 'CANCELLED' && !signal.aborted) {
          setState('backend-unavailable');
        }
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    check(controller.signal);
    return () => controller.abort();
  }, [check]);

  const retry = () => {
    const controller = new AbortController();
    check(controller.signal);
  };

  return (
    <div
      className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300"
      role="status"
      aria-live="polite"
      data-backend-status={state}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[state]}`} />
      <span className="whitespace-nowrap font-semibold">{LABELS[state]}</span>
      <button
        type="button"
        onClick={retry}
        className="rounded-lg px-1.5 py-0.5 font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-slate-700"
      >
        Retry
      </button>
    </div>
  );
};

export default BackendConnectionStatus;
