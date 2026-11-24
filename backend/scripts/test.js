/**
 * Test runner:
 *  1. Starts a throwaway PostgreSQL (embedded, random port, temp dir), unless TEST_DATABASE_URL is set.
 *     WARNING: TEST_DATABASE_URL must point to a disposable database; tests write data to it.
 *  2. Applies migrations.
 *  3. Runs `node --test` with an isolated test environment (random JWT secret, etc).
 *  4. Stops and deletes the temporary database.
 *
 *   npm test                          # all tests
 *   npm test -- tests/sales.test.js   # one file
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { runMigrations } from '../src/database/migrator.js';

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

let embedded;
let url = process.env.TEST_DATABASE_URL;

if (!url) {
  const port = await freePort();
  const password = randomBytes(16).toString('hex');
  embedded = new EmbeddedPostgres({
    databaseDir: path.join(os.tmpdir(), `optisell-test-pg-${process.pid}`),
    user: 'optisell_test',
    password,
    port,
    persistent: false,
    authMethod: 'scram-sha-256',
    postgresFlags: ['-c', 'listen_addresses=localhost', '-c', 'fsync=off', '-c', 'max_connections=200'],
    onLog: () => {},
  });
  process.stdout.write('Starting temporary PostgreSQL... ');
  await embedded.initialise();
  await embedded.start();
  await embedded.createDatabase('optisell_test');
  url = `postgresql://optisell_test:${password}@localhost:${port}/optisell_test`;
  console.log('ok');
}

let exitCode = 1;
try {
  await runMigrations({ connectionString: url, log: () => {} });

  const files = process.argv.slice(2);
  exitCode = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['--test', '--test-concurrency=4', ...(files.length ? files : ['tests/**/*.test.js'])],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DATABASE_URL: url,
          DATABASE_SSL: 'false',
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
    child.on('exit', (code) => resolve(code ?? 1));
  });
} catch (err) {
  console.error(err);
} finally {
  if (embedded) await embedded.stop();
}

process.exit(exitCode);
