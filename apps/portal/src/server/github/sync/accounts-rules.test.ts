import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidLogin, loginFromGithubUrl } from './accounts-rules.ts';

test('logins follow the contract rule', () => {
  for (const login of ['a', 'octocat', 'a-b-c', 'A1', 'x'.repeat(39)]) assert.equal(isValidLogin(login), true, login);
  for (const login of ['', '-a', 'a_b', 'a b', 'x'.repeat(40), 'a/b']) assert.equal(isValidLogin(login), false, login);
});

test('only a bare https profile URL suggests a login', () => {
  assert.equal(loginFromGithubUrl('https://github.com/Octocat'), 'Octocat');
  assert.equal(loginFromGithubUrl(' https://www.github.com/octocat/ '), 'octocat');
  assert.equal(loginFromGithubUrl('http://github.com/octocat'), null);
  assert.equal(loginFromGithubUrl('https://github.com.evil.example/octocat'), null);
  assert.equal(loginFromGithubUrl('https://github.com/octocat/repo'), null);
  assert.equal(loginFromGithubUrl('https://github.com/-bad'), null);
  assert.equal(loginFromGithubUrl('not a url'), null);
  assert.equal(loginFromGithubUrl(null), null);
});
