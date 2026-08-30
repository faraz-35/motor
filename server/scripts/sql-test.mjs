// SQL-level logic test: runs the RPCs against the live database with faked
// request.jwt.claims (auth.uid() reads that GUC), so create/join/swap/run
// behavior is verified independent of the auth provider. RLS itself is
// verified by api-test.mjs over REST once anonymous sign-ins are enabled.
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

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => cond ? (passed++, console.log(`  PASS ${name}`))
  : (failed++, console.error(`  FAIL ${name} ${detail}`));
const asUser = async (uuid) =>
  c.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: uuid, role: 'authenticated' })]);

const uids = [1, 2, 3, 4].map(() => crypto.randomUUID());
await c.query('delete from public.households');  // dev DB: tests own the whole schema
await c.query(`delete from auth.users where email like 'sqltest-%@motor.test'`);
for (let i = 0; i < uids.length; i++) {
  await c.query(`insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
                 values ($1, 'authenticated', 'authenticated', $2, now(), '{}', '{}')`,
    [uids[i], `sqltest-${i}@motor.test`]);
}
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
const addDays = (ds, n) => new Date(Date.parse(ds + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const dayNum = (ds) => Math.floor(Date.parse(ds + 'T00:00:00Z') / 86400000);

console.log('create + join');
await asUser(uids[0]);
const h = (await c.query("select * from public.create_household('Faraz')")).rows[0];
ok('create_household returns 6-char code', /^[A-Z2-9]{6}$/.test(h.code), h.code);
let joins = [];
for (let i = 1; i < 4; i++) {
  await asUser(uids[i]);
  joins.push((await c.query('select * from public.join_household($1, $2)', [h.code, ['Ayesha', 'Bilal', 'Usman'][i - 1]])).rows[0]);
}
ok('join x3 same household', joins.every((j) => j.household_id === h.household_id));

console.log('duplicate membership blocked');
await asUser(uids[1]);
const dup = await c.query('select * from public.join_household($1, $2)', [h.code, 'Clone']).catch(() => null);
ok('device cannot join twice', dup === null);
await asUser(crypto.randomUUID());
const badCode = await c.query('select * from public.join_household($1, $2)', ['ZZZZZZ', 'X']).catch(() => null);
ok('bogus code rejected', badCode === null);

console.log('rotation');
const members = (await c.query('select id, name from public.members where household_id = $1 order by rotation_order', [h.household_id])).rows;
ok('4 members in join order', members.length === 4 && members[0].name === 'Faraz' && members[3].name === 'Usman');
const rot = (await c.query('select public.rotation_assignment($1, $2::date) as id', [h.household_id, today])).rows[0].id;
ok('rotation matches day-number formula', rot === members[dayNum(today) % 4].id);

console.log('swap two-way');
// find a date within 10 days assigned to member[1], have them request, member[2] accept
let swapDay = null, reqId = null;
for (let i = 1; i <= 10; i++) {
  const d = addDays(today, i);
  const owner = (await c.query('select public.effective_assignment($1, $2::date) as id', [h.household_id, d])).rows[0].id;
  if (owner === members[1].id) { swapDay = d; break; }
}
ok('found upcoming date for member 2', !!swapDay);
await asUser(uids[1]);
await c.query('insert into public.swap_requests (household_id, on_date, from_member_id, status) values ($1, $2, $3, $4)',
  [h.household_id, swapDay, members[1].id, 'pending']);
reqId = (await c.query('select id from public.swap_requests where household_id = $1 order by created_at desc limit 1', [h.household_id])).rows[0].id;

await asUser(uids[2]);
const acc = await c.query('select * from public.accept_swap($1)', [reqId]);
ok('swap accepted', acc.rows.length === 1 && acc.rows[0].covered_by === members[2].id);
const covered = (await c.query('select public.effective_assignment($1, $2::date) as id', [h.household_id, swapDay])).rows[0].id;
ok('swap day reassigned to accepter', covered === members[2].id);
const payback = acc.rows[0].payback_date;
const paybackOwner = (await c.query('select public.effective_assignment($1, $2::date) as id', [h.household_id, payback])).rows[0].id;
ok('payback day assigned to requester', paybackOwner === members[1].id);

const dupAcc = await c.query('select * from public.accept_swap($1)', [reqId]).catch(() => null);
ok('double accept rejected', dupAcc === null);
await asUser(uids[1]);
const cancelResolved = await c.query('select * from public.cancel_swap($1)', [reqId]).catch(() => null);
ok('cancel after resolution rejected', cancelResolved === null);

console.log('run rows');
await asUser(uids[0]);
await c.query(`insert into public.runs (household_id, on_date, assigned_member_id, status, started_at, started_by)
               values ($1, $2, $3, 'started', now(), $3)`, [h.household_id, today, members[0].id]);
await c.query(`update public.runs set status = 'completed', stopped_at = now(), stopped_by = started_by
               where household_id = $1 and on_date = $2`, [h.household_id, today]);
const run = (await c.query('select * from public.runs where household_id = $1 and on_date = $2', [h.household_id, today])).rows[0];
ok('run completed with start/stop attribution', run.status === 'completed' && run.started_at && run.stopped_at);

console.log('cleanup');
await c.query('delete from public.households where id = $1', [h.household_id]);
const left = (await c.query('select count(*)::int as n from public.runs')).rows[0].n
  + (await c.query('select count(*)::int as n from public.members')).rows[0].n;
ok('cascade cleanup', left === 0, `left=${left}`);
await c.query(`delete from auth.users where email like 'sqltest-%@motor.test' or email like '%@devices.motor.family' or email like 'motor-probe%' or email like 'probe%'`);

await c.end();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
