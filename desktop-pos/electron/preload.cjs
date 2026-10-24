const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rmsPos', {
  getSettings: () => ipcRenderer.invoke('pos:settings'),
  saveGoogleMapsApiKey: async (apiKey) => {
    const result = await ipcRenderer.invoke('pos:google-maps-key', { apiKey });
    return result;
  },
  reverseGeocode: async (coordinates) => {
    try {
      return await ipcRenderer.invoke('pos:reverse-geocode', coordinates);
    } catch (error) {
      throw new Error(error?.message || 'Could not look up the address from GPS.');
    }
  },
  connect: async (settings) => {
    const result = await ipcRenderer.invoke('pos:connect', settings);
    if (!result?.ok) throw new Error(result?.error?.message || 'Could not connect this POS to the branch.');
    return result.data;
  },
  login: (credentials) => ipcRenderer.invoke('pos:login', credentials),
  logout: () => ipcRenderer.invoke('pos:logout'),
  testConnection: async (settings) => {
    const result = await ipcRenderer.invoke('pos:test-connection', settings);
    if (!result?.ok) throw new Error(result?.error?.message || 'Could not connect this POS to the branch.');
    return result.data;
  },
  clearSettings: () => ipcRenderer.invoke('pos:clear-settings'),
  request: async (method, path, body) => {
    const result = await ipcRenderer.invoke('pos:request', { method, path, body });
    if (!result?.ok) throw new Error(result?.error?.message || 'The backend request failed.');
    return result.data;
  },
  openCheckout: async (url) => ipcRenderer.invoke('pos:open-checkout', { url }),
});
