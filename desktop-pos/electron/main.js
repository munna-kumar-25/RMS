import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { clearSettings, readSettings, writeSettings } from './services/configService.js';
import { connectBranch, testBranchConnection } from './connection.js';
import { reverseGeocode } from './google-geocoding.js';
import { normalizePosApiPath } from './api-paths.js';
import { createAuthSession } from './auth-session.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const posAuthSession = createAuthSession();
const trustedAppUrl = process.env.VITE_DEV_SERVER_URL
  ? new URL(process.env.VITE_DEV_SERVER_URL).origin
  : pathToFileURL(path.join(here, '..', 'dist', 'index.html')).href;

const isTrustedPosSender = (event) => {
  const sender = BrowserWindow.fromWebContents(event.sender);
  if (!sender) return false;
  const frameUrl = event.senderFrame?.url || '';
  return process.env.VITE_DEV_SERVER_URL
    ? frameUrl === trustedAppUrl || frameUrl.startsWith(`${trustedAppUrl}/`)
    : frameUrl === trustedAppUrl;
};

ipcMain.handle('pos:settings', async (event) => {
  if (!isTrustedPosSender(event)) throw new Error('This POS configuration request is not allowed.');
  const settings = await readSettings();
  return settings ? {
    apiUrl: settings.apiUrl,
    keyPrefix: settings.apiKey.slice(0, 17),
    googleMapsConfigured: Boolean(settings.googleMapsApiKey),
  } : null;
});

ipcMain.handle('pos:google-maps-key', async (event, input) => {
  if (!isTrustedPosSender(event)) throw new Error('This POS configuration request is not allowed.');
  const settings = await readSettings();
  if (!settings) throw new Error('Connect this POS to a branch before configuring Google Maps.');
  if (typeof input?.apiKey !== 'string' || input.apiKey.trim().length > 256) {
    throw new Error('Enter a valid Google Maps API key.');
  }
  const apiKey = input.apiKey.trim();
  const nextSettings = { ...settings };
  if (apiKey) nextSettings.googleMapsApiKey = apiKey;
  else delete nextSettings.googleMapsApiKey;
  await writeSettings(nextSettings);
  return { configured: Boolean(apiKey) };
});

ipcMain.handle('pos:reverse-geocode', async (event, input) => {
  if (!isTrustedPosSender(event)) throw new Error('This POS location request is not allowed.');
  const settings = await readSettings();
  if (!settings) throw new Error('Connect this POS to a branch before looking up an address.');
  return reverseGeocode({
    latitude: Number(input?.latitude),
    longitude: Number(input?.longitude),
    apiKey: settings.googleMapsApiKey,
  });
});

ipcMain.handle('pos:connect', async (event, input) => {
  if (!isTrustedPosSender(event)) throw new Error('This POS configuration request is not allowed.');
  try {
    const settings = await connectBranch({
      apiUrl: input?.apiUrl,
      apiKey: input?.apiKey,
      getSavedKey: async () => (await readSettings())?.apiKey || '',
      saveSettings: async (nextSettings) => {
        const existingSettings = await readSettings();
        await writeSettings({
          ...nextSettings,
          ...(existingSettings?.googleMapsApiKey ? { googleMapsApiKey: existingSettings.googleMapsApiKey } : {}),
          ...(existingSettings?.paymentGatewayOrigins ? { paymentGatewayOrigins: existingSettings.paymentGatewayOrigins } : {}),
        });
      },
    });
    return { ok: true, data: { ...settings, googleMapsConfigured: Boolean((await readSettings())?.googleMapsApiKey) } };
  } catch (error) {
    return { ok: false, error: { message: error.message || 'Could not connect this POS to the branch.' } };
  }
});

ipcMain.handle('pos:test-connection', async (event, input) => {
  if (!isTrustedPosSender(event)) throw new Error('This POS connection test is not allowed.');
  try {
    const result = await testBranchConnection({
      apiUrl: input?.apiUrl,
      apiKey: input?.apiKey,
      getSavedKey: async () => (await readSettings())?.apiKey || '',
    });
    return { ok: true, data: { apiUrl: result.apiUrl, keyPrefix: result.keyPrefix } };
  } catch (error) {
    return { ok: false, error: { message: error.message || 'Could not connect this POS to the branch.' } };
  }
});

ipcMain.handle('pos:login', async (event, input) => {
  if (!isTrustedPosSender(event)) throw new Error('This POS sign-in request is not allowed.');
  if (typeof input?.email !== 'string' || typeof input?.password !== 'string') {
    throw new Error('Enter your email address and password.');
  }
  const settings = await readSettings();
  if (!settings) throw new Error('Connect this POS to a branch before signing in.');
  return posAuthSession.login(settings.apiUrl, input.email, input.password);
});

ipcMain.handle('pos:logout', async (event) => {
  if (!isTrustedPosSender(event)) throw new Error('This POS sign-out request is not allowed.');
  await posAuthSession.logout();
  return true;
});

ipcMain.handle('pos:clear-settings', async (event) => {
  if (!isTrustedPosSender(event)) throw new Error('This POS configuration request is not allowed.');
  await clearSettings();
  return true;
});

ipcMain.handle('pos:request', async (event, input) => {
  try {
    if (!isTrustedPosSender(event)) throw new Error('This POS backend request is not allowed.');
    if (!input || !['GET', 'POST', 'PATCH'].includes(input.method)) {
      throw new Error('Unsupported POS request.');
    }
    const requestPath = normalizePosApiPath(input.path);
    if (!requestPath) {
      throw new Error(`The Desktop POS does not allow ${input.method} ${String(input.path)}. Restart Desktop POS if this endpoint was recently added.`);
    }
    const settings = await readSettings();
    if (!settings) throw new Error('Connect this POS to a branch before continuing.');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${settings.apiUrl}${requestPath}`, {
        method: input.method,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.apiKey,
        },
        ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
        signal: controller.signal,
      });
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error(`Backend returned an invalid response (${response.status}).`);
      }
      if (!response.ok) {
        throw new Error(payload?.error?.message || payload?.message || `Backend request failed (${response.status}).`);
      }
      if (input.method === 'POST' && /^\/payments\/gateways\/orders\/[a-f\d]{24}\/start$/i.test(requestPath)) {
        const checkoutUrl = new URL(payload?.data?.checkoutUrl);
        if (checkoutUrl.protocol !== 'https:' || checkoutUrl.username || checkoutUrl.password) {
          throw new Error('The backend returned an unsafe hosted checkout link.');
        }
        const origins = new Set(settings.paymentGatewayOrigins || []);
        origins.add(checkoutUrl.origin);
        settings.paymentGatewayOrigins = [...origins].slice(-8);
        await writeSettings(settings);
      }
      return { ok: true, data: payload?.data };
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Backend request timed out. Check that the server is running and the URL is correct.');
      }
      if (error instanceof TypeError || error.cause || error.message === 'fetch failed') {
        const backendUrl = new URL(settings.apiUrl);
        if (['localhost', '127.0.0.1', '[::1]'].includes(backendUrl.hostname) && backendUrl.port === '50001') {
          throw new Error('Port 50001 is incorrect for this local backend. Use http://localhost:5001 instead.');
        }
        throw new Error(`Could not connect to the backend at ${settings.apiUrl}. Check that the backend is running and the URL and port are correct.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return { ok: false, error: { message: error.message || 'The backend request failed.' } };
  }
});

ipcMain.handle('pos:open-checkout', async (event, input) => {
  if (!isTrustedPosSender(event)) throw new Error('This POS checkout request is not allowed.');
  const checkoutUrl = String(input?.url || '');
  let target;
  let settings;
  try {
    target = new URL(checkoutUrl);
    settings = await readSettings();
  } catch {
    throw new Error('The payment provider returned an invalid checkout link.');
  }
  if (!settings || target.protocol !== 'https:' || target.username || target.password) {
    throw new Error('The payment provider returned an unsafe checkout link.');
  }
  const apiOrigin = new URL(settings.apiUrl).origin;
  const host = target.hostname.toLowerCase();
  const providerHost = ['paytm.com', 'phonepe.com'].some((domain) => host === domain || host.endsWith(`.${domain}`));
  const gatewayOrigin = (settings.paymentGatewayOrigins || []).includes(target.origin);
  if (target.origin !== apiOrigin && !gatewayOrigin && !providerHost) {
    throw new Error('The checkout link is not from the configured backend or a supported payment provider.');
  }
  await shell.openExternal(target.toString());
  return true;
});

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => {
    const requestingUrl = details?.requestingUrl || '';
    const isAppPage = process.env.VITE_DEV_SERVER_URL
      ? requestingUrl === trustedAppUrl || requestingUrl.startsWith(`${trustedAppUrl}/`)
      : requestingUrl === trustedAppUrl;
    callback(contents === window.webContents && permission === 'geolocation' && isAppPage);
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, target) => {
    const devServer = process.env.VITE_DEV_SERVER_URL;
    const allowed = devServer
      ? new URL(target).origin === new URL(devServer).origin
      : target === pathToFileURL(path.join(here, '..', 'dist', 'index.html')).href;
    if (!allowed) event.preventDefault();
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    window.loadFile(path.join(here, '..', 'dist', 'index.html'));
  }
};

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
