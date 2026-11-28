/**
 * Manage admin accounts from the server (the API has no endpoint that changes roles).
 * The account in backend/.env (ADMIN_EMAIL / ADMIN_PASSWORD) is made admin automatically on start.
 * Stop the backend first: it keeps the data in memory and would overwrite these changes.
 *
 *   npm run admin -- list
 *   npm run admin -- grant  someone@example.com    # the account must already be registered
 *   npm run admin -- revoke someone@example.com
 */
import 'dotenv/config';

const [command, rawEmail] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();

if (!['list', 'grant', 'revoke'].includes(command) || (command !== 'list' && !email)) {
  console.error('Usage: npm run admin -- list | grant <email> | revoke <email>');
  process.exit(1);
}

const { closeStorage, db, flush, load, update } = await import('../src/db/store.js');
const { audit } = await import('../src/services/adminAuth.service.js');
await load();

if (command === 'list') {
  const admins = db.users.filter((u) => u.role === 'admin');
  if (!admins.length) console.log('No admin accounts.');
  for (const u of admins) console.log(`${u.email}\t${u.full_name}\t${u.created_at}`);
} else {
  const user = db.users.find((u) => u.email === email);
  if (!user) {
    console.error(`No account with email ${email}. Register it first, then run this again.`);
    process.exitCode = 1;
  } else {
    const role = command === 'grant' ? 'admin' : 'user';
    update('users', user, { role });
    audit(null, command === 'grant' ? 'role.grant' : 'role.revoke', { targetId: user.id, details: { email, via: 'cli' } });
    await flush();
    console.log(`${email} is now role=${role}.`);
  }
}

await closeStorage();
