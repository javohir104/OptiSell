import 'dotenv/config';
import { runMigrations } from '../src/database/migrator.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set (see .env.example)');
  process.exit(1);
}

try {
  await runMigrations({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true',
  });
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
