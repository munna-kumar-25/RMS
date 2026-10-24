import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { readEnv } from '../../config/env.js';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('readEnv reports missing required keys without echoing values', () => {
  const { missing, env } = readEnv({
    PORT: '5000',
    NODE_ENV: 'test',
    MONGODB_URI: '',
    CORS_ORIGINS: '',
    JWT_SECRET: 'should-not-appear',
  });
  assert.deepEqual(missing, ['MONGODB_URI', 'CORS_ORIGINS', 'SESSION_SECRET']);
  assert.equal(env.MONGODB_URI, '');
  assert.equal(JSON.stringify(missing).includes('should-not-appear'), false);
});

test('server startup exits when required configuration is missing', () => {
  const result = spawnSync(process.execPath, ['server.js'], {
    cwd: backendRoot,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      PATHEXT: process.env.PATHEXT,
      NODE_ENV: 'development',
      PORT: '0',
      MONGODB_URI: '',
      MONGO_URI: '',
      CORS_ORIGINS: '',
      FRONTEND_URL: '',
      SESSION_SECRET: '',
    },
  });

  const output = `${result.stdout || ''}${result.stderr || ''}`;
  assert.equal(result.status, 1);
  assert.match(output, /Missing required configuration: MONGODB_URI, CORS_ORIGINS/);
  assert.equal(output.includes('mongodb://'), false);
});
