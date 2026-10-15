import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configuredOrigins, isAllowedWebOrigin } from './origin-policy.ts';

test('personal origins are exact explicit HTTPS matches alongside legacy origins', () => {
  const defaults = ['https://club.example'];
  const value = 'https://personal.example, https://preview.example';
  assert.deepEqual(configuredOrigins(value), ['https://personal.example', 'https://preview.example']);
  assert.equal(isAllowedWebOrigin('https://club.example', value, defaults), true);
  assert.equal(isAllowedWebOrigin('https://personal.example', value, defaults), true);
  for (const origin of ['https://personal.example.attacker.com', 'https://other.example', 'http://personal.example', 'null']) {
    assert.equal(isAllowedWebOrigin(origin, value, defaults), false);
  }
});

test('malformed config and wildcard origins fail closed', () => {
  for (const value of ['https://*.example', 'http://example.com', 'https://example.com/path', 'https://user:secret@example.com', 'https://example.com,', 'https://example.com/', 'not-a-url']) {
    assert.throws(() => configuredOrigins(value));
    assert.equal(isAllowedWebOrigin('https://club.example', value, ['https://club.example']), false);
  }
  assert.equal(isAllowedWebOrigin('https://club.example', undefined, ['https://club.example']), true);
});
