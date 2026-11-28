/**
 * Create the local test account (test@optisell.uz / Test12345) with sample data.
 * Stop the backend first: it keeps the data in memory and would overwrite these changes.
 *
 *   npm run seed
 */
import 'dotenv/config';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed production data (the test password is public).');
  process.exit(1);
}

const { closeStorage, flush, load } = await import('../src/db/store.js');
const { seed } = await import('../src/db/seed.js');

try {
  await load();
  await seed();
  await flush();
  await closeStorage();
} catch (err) {
  console.error('Seed failed:', err.message);
  process.exitCode = 1;
}
