import api from './api.js';

/**
 * Checks liveness and readiness. Pass an AbortSignal to cancel an in-flight check.
 */
export const fetchBackendConnection = async (signal) => {
  try {
    await api.get('/health', { signal });
  } catch (error) {
    if (error.code === 'CANCELLED') throw error;
    return { state: 'backend-unavailable' };
  }

  try {
    const ready = await api.get('/health/ready', {
      signal,
      validateStatus: () => true,
    });
    if (ready.status === 200 && ready.data?.success === true) {
      return { state: 'connected' };
    }
    if (ready.status === 503) {
      return { state: 'database-unavailable' };
    }
    return { state: 'backend-unavailable' };
  } catch (error) {
    if (error.code === 'CANCELLED') throw error;
    return { state: 'backend-unavailable' };
  }
};

export default fetchBackendConnection;
