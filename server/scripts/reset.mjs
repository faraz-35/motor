// Drops the app schema + functions wholesale. Dev tool: pairs with `npm run migrate`
// to reapply migrations from scratch (all data is destroyed).
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of (await readFile(join(here, '../.env'), 'utf8')).split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
for (const sql of [
  'drop table if exists _migrations',
  'drop table if exists public.households, public.members, public.assignments, public.swap_requests, public.runs cascade',
  'drop function if exists public.create_household(text, time, int), public.join_household(text, text), public.accept_swap(uuid), public.cancel_swap(uuid) cascade',
  'drop function if exists public.is_member(uuid), public.rotation_assignment(uuid, date), public.effective_assignment(uuid, date) cascade',
]) await c.query(sql);
console.log('reset done');
await c.end();
