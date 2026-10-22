import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pool } from './db.js';
import { env } from './config.js';
const c = await pool.connect();
try {
  await c.query('SELECT pg_advisory_lock(730021)');
  await c.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz DEFAULT now())',
  );
  for (const name of (await readdir(env.MIGRATIONS_DIR)).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = await readFile(join(env.MIGRATIONS_DIR, name), 'utf8');
    const hash = createHash('sha256').update(sql).digest('hex');
    const old = await c.query('SELECT sha256 FROM schema_migrations WHERE name=$1', [name]);
    if (old.rowCount) {
      if (old.rows[0].sha256 !== hash) throw Error('Migration changed: ' + name);
      continue;
    }
    await c.query('BEGIN');
    try {
      await c.query(sql);
      await c.query('INSERT INTO schema_migrations(name,sha256) VALUES($1,$2)', [name, hash]);
      await c.query('COMMIT');
      console.log('Applied', name);
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    }
  }
} finally {
  await c.query('SELECT pg_advisory_unlock(730021)');
  c.release();
  await pool.end();
}
