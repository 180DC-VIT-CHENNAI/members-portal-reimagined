import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GITHUB_ERROR_CODES } from '../server/github/types.ts';
import { describeCode } from './errors.ts';

test('every GitHub error code has a message of its own', () => {
  const missing = GITHUB_ERROR_CODES.filter((code) => describeCode(code) === code);
  assert.deepEqual(missing, []);
});
