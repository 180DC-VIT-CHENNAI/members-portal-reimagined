import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedClerkIdentity } from './clerk-identity.ts';
const settings = { defaults: ['https://legacy.example'], configured: 'https://personal.example', development: false };
const valid = { sub: 'user_synthetic', sid: 'sess_synthetic', azp: 'https://personal.example' };
const identity = (claims, origins = settings) => verifiedClerkIdentity('synthetic-jwt', 'synthetic-secret', origins, async () => claims);
test('identity comes from verified session subject with approved origin', async () => {
  assert.equal(await identity(valid), 'user_synthetic');
  assert.equal(await identity({ ...valid, azp: 'https://legacy.example', sts: 'active' }), 'user_synthetic');
});
test('provider errors and missing configuration fail closed', async () => {
  await assert.rejects(verifiedClerkIdentity('invalid', 'synthetic', settings, async () => { throw new Error('sensitive provider detail'); }), e => e.status === 401 && !e.message.includes('sensitive'));
  await assert.rejects(verifiedClerkIdentity('invalid', undefined, settings, async () => valid), e => e.status === 503);
});
test('machine, pending, malformed and foreign-origin sessions are rejected', async () => {
  for (const claims of [null, {}, { ...valid, sub: null }, { ...valid, sid: undefined }, { ...valid, sts: 'pending' }, { ...valid, azp: undefined }, { ...valid, azp: 'https://foreign.example' }, { ...valid, azp: 'https://personal.example.evil' }]) {
    await assert.rejects(identity(claims), e => e.status === 401);
  }
  await assert.rejects(identity(valid, { ...settings, configured: '*' }), e => e.status === 401);
});
test('loopback sessions are accepted only in development and require an exact HTTP origin', async () => {
  for (const azp of ['http://localhost:5173', 'http://127.0.0.1:5173']) {
    await assert.rejects(identity({ ...valid, azp }), e => e.status === 401);
    assert.equal(await identity({ ...valid, azp }, { ...settings, development: true }), 'user_synthetic');
  }
  await assert.rejects(identity({ ...valid, azp: 'ftp://localhost' }, { ...settings, development: true }), e => e.status === 401);
});
