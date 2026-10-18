import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const REQUIRED_TABLES = [
  'people', 'access_roles', 'projects', 'project_tasks', 'meets',
  'newsletter_subscribers', 'letter_documents', 'email_queue',
];

/** Restore a trusted portal SQL export in memory, never into a live database. */
export function verifyPortalBackup(sql) {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(sql);
    const integrity = db.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new Error('Backup failed integrity_check');
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Backup contains broken foreign keys');
    const tables = new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all().map((row) => row.name));
    const missing = REQUIRED_TABLES.filter((name) => !tables.has(name));
    if (missing.length) throw new Error(`Not a complete portal backup: missing ${missing.join(', ')}`);
    const people = db.prepare('SELECT count(*) AS count FROM people').get().count;
    const roles = db.prepare('SELECT count(*) AS count FROM access_roles').get().count;
    if (!roles) throw new Error('Backup has no access roles');
    return { integrity: 'ok', foreignKeys: 'ok', tables: tables.size, people, roles };
  } finally {
    db.close();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const path = process.argv[2];
  if (!path) throw new Error('Usage: node scripts/verify-portal-backup.mjs <trusted-export.sql[.gz]>');
  const bytes = readFileSync(path);
  const sql = (path.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8');
  console.log(JSON.stringify(verifyPortalBackup(sql)));
}
