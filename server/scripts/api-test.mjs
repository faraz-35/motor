// End-to-end backend test against the live Supabase project, over the same
// surfaces the app uses: anonymous auth -> RPCs -> REST reads/writes under RLS.
// Creates a throwaway household per run (code is random; rows are harmless).
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of (await readFile(join(here, '../.env'), 'utf8')).split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const URL_ = process.env.SUPABASE_URL ?? env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY;

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.error(`  FAIL ${name} ${detail}`); }
};

async function sb(path, { method = 'GET', token, body, query } = {}) {
  const qs = query ? '?' + new URLSearchParams(query).toString() : '';
  const res = await fetch(`${URL_}/rest/v1/${path}${qs}`, {
    method,
    headers: {
      apikey: ANON,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* error payloads are plain text sometimes */ }
  return { status: res.status, json, text };
}

const rpc = async (fn, token, params) => {
  const r = await sb(`rpc/${fn}`, { method: 'POST', token, body: params });
  return { ...r, row: Array.isArray(r.json) ? r.json[0] ?? null : r.json };
};

async function anonDevice() {
  const claim = await sb('rpc/claim_device_account', { method: 'POST', token: null, body: {} });
  const account = Array.isArray(claim.json) ? claim.json[0] : claim.json;
  if (claim.status !== 200 || !account?.email) throw new Error(`pool claim failed (${claim.status}): ${claim.text}`);
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  if (!res.ok) throw new Error(`password grant failed (${res.status}): ${await res.text()}`);
  const { access_token } = await res.json();
  return access_token;
}

// Same formula as the app and as SQL rotation_assignment().
const karachiToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
const addDays = (ds, n) => new Date(Date.parse(ds + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const dayNumber = (ds) => Math.floor(Date.parse(ds + 'T00:00:00Z') / 86400000);
const rotationAssign = (ds, members) => members[dayNumber(ds) % members.length];

// ---- fixtures: wipe throwaway households + release pool claims (dev DB only) ----
{
  const pgmod = await import('pg');
  const pgc = new pgmod.default.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pgc.connect();
  await pgc.query('delete from public.households');
  await pgc.query('select public.release_device_pool()');
  await pgc.end();
}

// ---- run ----
console.log('devices: anonymous sign-in x5');
const tokens = [];
for (let i = 0; i < 5; i++) tokens.push(await anonDevice());
ok('five anonymous devices', tokens.length === 5 && tokens.every(Boolean));

console.log('household: create + join x3');
const names = ['Faraz', 'Ayesha', 'Bilal', 'Usman'];
const created = await rpc('create_household', tokens[0], { p_name: names[0], p_reminder: '10:00', p_minutes: 10 });
ok('create_household', created.status === 200 && !!created.row?.household_id, created.text);
const H = created.row.household_id;

const joins = [];
for (let i = 1; i <= 3; i++) joins.push(await rpc('join_household', tokens[i], { p_code: created.row.code, p_name: names[i] }));
ok('join_household x3', joins.every((j) => j.status === 200), joins.map((j) => j.text).join(' | '));
const outsider = tokens[4];

const membersRes = await sb('members', { token: tokens[1], query: { select: '*', order: 'rotation_order.asc' } });
ok('members readable, 4, ordered by join', membersRes.status === 200 && membersRes.json.length === 4
  && membersRes.json.every((m, i) => m.rotation_order === i), membersRes.text);
const members = membersRes.json;

console.log('rotation + run lifecycle');
const today = karachiToday();
const todays = rotationAssign(today, members);
const tokenByMember = new Map([
  [members[0].id, tokens[0]], [members[1].id, tokens[1]],
  [members[2].id, tokens[2]], [members[3].id, tokens[3]],
]);

const startRes = await sb('runs', {
  method: 'POST', token: tokenByMember.get(todays.id),
  query: { on_conflict: 'household_id,on_date' },
  body: [{ household_id: H, on_date: today, assigned_member_id: todays.id, status: 'started', started_by: todays.id }],
});
ok('run started by assigned member', startRes.status === 201 && startRes.json[0].status === 'started', startRes.text);

const stopRes = await sb('runs', {
  method: 'PATCH', token: tokenByMember.get(todays.id),
  query: { household_id: `eq.${H}`, on_date: `eq.${today}` },
  body: { status: 'completed', stopped_by: todays.id },
});
ok('run stopped -> completed', stopRes.status === 200 && stopRes.json[0].status === 'completed', stopRes.text);

// someone else covers a started-but-unfinished run (the "refer to somebody" path)
const coverDay = addDays(today, 1);
let coverAssigned = rotationAssign(coverDay, members);
const takeover = await sb('runs', {
  method: 'POST', token: tokenByMember.get(coverAssigned.id) === tokens[0] ? tokens[1] : tokens[0],
  query: { on_conflict: 'household_id,on_date' },
  body: [{ household_id: H, on_date: coverDay, assigned_member_id: coverAssigned.id, status: 'completed', started_by: members.find((m) => (tokenByMember.get(m.id) === (tokenByMember.get(coverAssigned.id) === tokens[0] ? tokens[1] : tokens[0]))).id, stopped_by: members.find((m) => (tokenByMember.get(m.id) === (tokenByMember.get(coverAssigned.id) === tokens[0] ? tokens[1] : tokens[0]))).id }],
});
ok('other member can cover a run', takeover.status === 201 && takeover.json[0].started_by !== takeover.json[0].assigned_member_id, takeover.text);

console.log('swap flow (two-way)');
const swapDay = addDays(today, 2);
const swapper = rotationAssign(swapDay, members);
const accepter = members.find((m) => m.id !== swapper.id && m.active);
const reqRes = await sb('swap_requests', {
  method: 'POST', token: tokenByMember.get(swapper.id),
  body: [{ household_id: H, on_date: swapDay, from_member_id: swapper.id, to_member_id: null, status: 'pending' }],
});
ok('swap request created', reqRes.status === 201, reqRes.text);

const accRes = await rpc('accept_swap', tokenByMember.get(accepter.id), { p_request_id: reqRes.json[0].id });
ok('swap accepted with payback date', accRes.status === 200 && !!accRes.row?.payback_date, accRes.text);
const { swap_date, covered_by, payback_date } = accRes.row;

const assigns = await sb('assignments', { token: tokens[0], query: { select: '*' } });
const byDate = Object.fromEntries(assigns.json.map((a) => [a.on_date, a.member_id]));
ok('swap day now assigned to accepter', byDate[swap_date] === accepter.id);
ok('payback day assigned to requester', byDate[payback_date] === swapper.id);
ok('payback is accepter own upcoming date', rotationAssign(payback_date, members) === accepter.id || byDate[payback_date] === swapper.id);

const dupAccept = await rpc('accept_swap', tokenByMember.get(accepter.id), { p_request_id: reqRes.json[0].id });
ok('double-accept rejected', dupAccept.status >= 400, dupAccept.text);

const cancelRes = await rpc('cancel_swap', tokenByMember.get(swapper.id), { p_request_id: reqRes.json[0].id });
ok('cancel of resolved request rejected', cancelRes.status >= 400, cancelRes.text);

console.log('settings + realtime publication rows');
const timeRes = await sb('households', { method: 'PATCH', token: tokens[2], query: { id: `eq.${H}` }, body: { reminder_time: '09:30', run_minutes: 15 } });
ok('settings updatable by any member', timeRes.status === 200 && timeRes.json[0].reminder_time === '09:30:00', timeRes.text);

console.log('RLS isolation');
const outHouseholds = await sb('households', { token: outsider, query: { select: '*' } });
ok('outsider sees no households', outHouseholds.status === 200 && outHouseholds.json.length === 0);
const outMembers = await sb('members', { token: outsider, query: { select: '*' } });
ok('outsider sees no members', outMembers.status === 200 && outMembers.json.length === 0);
const outRuns = await sb('runs', { method: 'POST', token: outsider, body: [{ household_id: H, on_date: addDays(today, 3), status: 'scheduled' }] });
ok('outsider cannot write runs', outRuns.status >= 400);
const outJoin = await rpc('join_household', outsider, { p_code: 'XXXXXX', p_name: 'Evil' });
ok('bogus join code rejected', outJoin.status >= 400);

// restore settings to defaults for the real family
await sb('households', { method: 'PATCH', token: tokens[0], query: { id: `eq.${H}` }, body: { reminder_time: '10:00', run_minutes: 10 } });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
