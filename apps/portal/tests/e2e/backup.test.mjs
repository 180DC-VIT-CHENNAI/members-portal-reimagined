import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyPortalBackup } from '../../../../scripts/verify-portal-backup.mjs';

const TABLES = ['people', 'access_roles', 'projects', 'project_tasks', 'meets', 'newsletter_subscribers', 'letter_documents', 'email_queue'];
const schema = TABLES.map((table) => `CREATE TABLE ${table} (id TEXT PRIMARY KEY);`).join('\n');

test('a complete SQL export restores offline with integrity and foreign-key checks', () => {
  const sql = `${schema} INSERT INTO access_roles VALUES ('admin'); INSERT INTO people VALUES ('person');`;
  assert.deepEqual(verifyPortalBackup(sql), { integrity: 'ok', foreignKeys: 'ok', tables: 8, people: 1, roles: 1 });
});

test('a D1 export that loads a child table before its parent still restores', () => {
  // The live export loads Better Auth `session` rows before the `user` table exists.
  const sql = `PRAGMA defer_foreign_keys=TRUE;
    CREATE TABLE session (id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES user(id));
    INSERT INTO session VALUES ('s', 'u');
    CREATE TABLE user (id TEXT PRIMARY KEY);
    INSERT INTO user VALUES ('u');
    ${schema} INSERT INTO access_roles VALUES ('admin');`;
  assert.equal(verifyPortalBackup(sql).foreignKeys, 'ok');
  assert.throws(() => verifyPortalBackup(sql.replace("VALUES ('u');", "VALUES ('other');")), /broken foreign keys/);
});

test('legacy or incomplete exports cannot pass as portal backups', () => {
  assert.throws(() => verifyPortalBackup('CREATE TABLE users (id TEXT);'), /missing/);
  assert.throws(() => verifyPortalBackup(schema), /no access roles/);
});

test('a dump with broken references is rejected even if it disabled foreign keys', () => {
  const sql = `${schema} INSERT INTO access_roles VALUES ('admin');
    PRAGMA foreign_keys = OFF;
    CREATE TABLE broken (person_id TEXT REFERENCES people(id));
    INSERT INTO broken VALUES ('missing');`;
  assert.throws(() => verifyPortalBackup(sql), /broken foreign keys/);
});
