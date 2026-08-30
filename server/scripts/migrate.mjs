// Applies server/migrations/*.sql in order, once each, tracked in _migrations.
// Whole-file queries: node-postgres runs multi-statement strings over the
// simple protocol, so $$-bodied functions survive intact.
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of (await readFile(join(here, '../.env'), 'utf8')).split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL ?? env.DATABASE_URL });
await client.connect();

await client.query('create table if not exists _migrations (name text primary key, applied_at timestamptz default now())');
const applied = new Set((await client.query('select name from _migrations')).rows.map((r) => r.name));
const files = (await readdir(join(here, '../migrations'))).filter((f) => f.endsWith('.sql')).sort();

for (const file of files) {
  if (applied.has(file)) {
    console.log(`skip  ${file}`);
    continue;
  }
  const sql = await readFile(join(here, '../migrations', file), 'utf8');
  await client.query('begin');
  try {
    await client.query(sql);
    await client.query('insert into _migrations (name) values ($1)', [file]);
    await client.query('commit');
    console.log(`ok    ${file}`);
  } catch (err) {
    await client.query('rollback');
    console.error(`FAIL  ${file}: ${err.message}`);
    process.exitCode = 1;
    break;
  }
}
await client.end();
