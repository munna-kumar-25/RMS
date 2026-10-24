import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const getBackendPort = () => {
  if (/^\d+$/.test(process.env.PORT || '')) return process.env.PORT;

  try {
    const backendEnvPath = resolve(dirname(fileURLToPath(import.meta.url)), '../backend/.env');
    const backendEnv = readFileSync(backendEnvPath, 'utf8');
    const port = backendEnv.match(/^\s*PORT\s*=\s*["']?(\d+)["']?\s*$/m)?.[1];
    return port || '5000';
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return '5000';
  }
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const defaultBackendUrl = `http://127.0.0.1:${getBackendPort()}`;
  const proxyTarget = env.VITE_API_PROXY_TARGET || defaultBackendUrl;
  const apiUrl = env.VITE_API_URL;
  const desktopBackendUrl = env.VITE_DESKTOP_BACKEND_URL
    || (apiUrl && /^https?:\/\//i.test(apiUrl) ? apiUrl : proxyTarget);

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_DESKTOP_BACKEND_URL': JSON.stringify(desktopBackendUrl),
    },
    server: {
      host: '127.0.0.1',
      port: 3000,
      strictPort: false,
      open: true,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
