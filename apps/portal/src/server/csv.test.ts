import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCsv, parseCsvRecords, toCsv } from './csv.ts';

test('parses quotes, escaped quotes, commas and newlines', () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","say ""hi""\nthere"\n'), [
    ['a', 'b'],
    ['x, y', 'say "hi"\nthere'],
  ]);
});

test('drops blank lines and a byte-order mark', () => {
  assert.deepEqual(parseCsv('\uFEFFa\n\n,\nb'), [['a'], ['b']]);
});

test('records use lower-cased trimmed headers', () => {
  assert.deepEqual(parseCsvRecords(' Email ,Full_Name\n a@x.com , A \n'), [{ email: 'a@x.com', full_name: 'A' }]);
});

test('serialization round-trips and neutralizes formulas', () => {
  const csv = toCsv(['name', 'note'], [['A, B', '=SUM(1)'], [null, 'x"y']]);
  assert.equal(csv, 'name,note\r\n"A, B",\'=SUM(1)\r\n,"x""y"\r\n');
  assert.deepEqual(parseCsv(csv), [['name', 'note'], ['A, B', "'=SUM(1)"], ['', 'x"y']]);
});
