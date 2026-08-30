// (Re)seeds the device account pool: creates auth users through GoTrue's
// admin API (correct hash format + row shape) and mirrors credentials into
// public.device_accounts for the claim RPC. Idempotent per email.
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of (await readFile(join(here, '../.env'), 'utf8')).split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const URL_ = env.SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_KEY;
if (!SERVICE) { console.error('SUPABASE_SERVICE_KEY missing from server/.env'); process.exit(1); }

const POOL_SIZE = 12;
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

// drop the SQL-seeded users that predate admin-API seeding
await c.query(`delete from auth.users where email like 'devpool-%' and instance_id is null`);
await c.query(`delete from auth.users where email = 'devpool-99@devices.motor.app'`);

const existing = new Set((await c.query('select email from public.device_accounts')).rows.map((r) => r.email));
let created = 0;
for (let i = 1; i <= POOL_SIZE; i++) {
  const email = `devpool-${String(i).padStart(2, '0')}@devices.motor.app`;
  if (existing.has(email)) continue;
  const password = 'motor-' + crypto.randomBytes(8).toString('hex');
  let res = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  let user = null;
  if (res.status === 201) {
    user = await res.json();  // fresh create, password as requested
  } else if (res.status === 200 || res.status === 422) {
    const { rows } = await c.query('select id from auth.users where email = $1', [email]);
    if (!rows.length) { console.error(`skip ${email}: exists per API, absent in DB`); continue; }
    res = await fetch(`${URL_}/auth/v1/admin/users/${rows[0].id}`, {
      method: 'PUT',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, email_confirm: true }),
    });
    if (res.status >= 300) { console.error(`skip ${email}: reset failed ${res.status}`); continue; }
  } else {
    console.error(`skip ${email}: ${res.status} ${(await res.text()).slice(0, 120)}`);
    continue;
  }
  await c.query('insert into public.device_accounts (email, password) values ($1, $2)', [email, password]);
  created++;
}
console.log(`pool seeded: ${created} new, ${existing.size} existing`);
await c.end();
