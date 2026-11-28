/**
 * Test runner: runs `node --test` with an isolated test environment.
 * NODE_ENV=test keeps all data in memory, so tests never touch backend/data.
 *
 *   npm test                          # all tests
 *   npm test -- tests/sales.test.js   # one file
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const files = process.argv.slice(2);
const child = spawn(
  process.execPath,
  ['--test', '--test-concurrency=4', ...(files.length ? files : ['tests/**/*.test.js'])],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      JWT_SECRET: randomBytes(48).toString('hex'),
      JWT_EXPIRES_IN: '1h',
      BCRYPT_ROUNDS: '8',
      RATE_LIMIT_MAX: '100000',
      AUTH_RATE_LIMIT_MAX: '100000',
      TRUST_PROXY: '0',
      CORS_ORIGINS: 'http://localhost:5173',
      APP_TIMEZONE: 'Asia/Tashkent',
    },
  },
);
child.on('exit', (code) => process.exit(code ?? 1));
