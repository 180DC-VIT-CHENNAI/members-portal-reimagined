import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bodySegments, directKey, EDIT_WINDOW_MS, editDecision, MAX_MENTIONS, parseMentions, plainText, quietHoursActive, validQuietHours } from './messaging-rules.ts';

const sent = '2030-01-15 10:00:00';
const sentAt = Date.parse('2030-01-15T10:00:00Z');
const live = { authorId: 'p_a', createdAt: sent, deletedAt: null };

test('the author may edit a live message until exactly 15 minutes after sending it', () => {
  assert.equal(editDecision(live, 'p_a', sentAt + EDIT_WINDOW_MS), 'ok');
  assert.equal(editDecision(live, 'p_a', sentAt + EDIT_WINDOW_MS + 1), 'window_closed');
});

test('nobody else may edit, and a deleted message stays deleted', () => {
  assert.equal(editDecision(live, 'p_b', sentAt), 'not_author');
  assert.equal(editDecision({ ...live, deletedAt: '2030-01-15T10:01:00Z' }, 'p_a', sentAt + 1000), 'deleted');
});

test('stored ISO timestamps count the window the same way as SQLite datetimes', () => {
  assert.equal(editDecision({ ...live, createdAt: '2030-01-15T10:00:00.000Z' }, 'p_a', sentAt + EDIT_WINDOW_MS + 1), 'window_closed');
});

test('mentions are distinct person ids in order of first mention', () => {
  assert.deepEqual(parseMentions('hi @[Asha](p_1) and @[Ravi K](p-2), again @[Asha](p_1)'), ['p_1', 'p-2']);
});

test('text that only looks like a mention, or names an invalid id, mentions nobody', () => {
  assert.deepEqual(parseMentions('mail me @ asha, [Asha](p_1), @[](p_1), @[Asha](p 1), @[Asha](<script>)'), []);
});

test('at most 20 people are mentioned per message', () => {
  const body = Array.from({ length: 30 }, (_, i) => `@[P${i}](p_${i})`).join(' ');
  assert.equal(parseMentions(body).length, MAX_MENTIONS);
});

test('a body splits into text and mentions, and previews show @Name', () => {
  const body = 'ping @[Asha](p_1)!';
  assert.deepEqual(bodySegments(body), [{ text: 'ping ' }, { mention: 'Asha', personId: 'p_1' }, { text: '!' }]);
  assert.equal(plainText(body), 'ping @Asha!');
});

test('the direct key is the same whichever person starts the conversation', () => {
  assert.equal(directKey('p_b', 'p_a'), directKey('p_a', 'p_b'));
});

test('quiet hours are both set to different valid times, or both empty', () => {
  assert.equal(validQuietHours(null, null), true);
  assert.equal(validQuietHours('22:00', '07:30'), true);
  assert.equal(validQuietHours('22:00', null), false);
  assert.equal(validQuietHours('22:00', '22:00'), false);
  assert.equal(validQuietHours('24:00', '07:00'), false);
});

test('quiet hours include their start and exclude their end in India time', () => {
  assert.equal(quietHoursActive('10:00', '11:00', new Date('2030-01-15T04:29:59Z')), false);
  assert.equal(quietHoursActive('10:00', '11:00', new Date('2030-01-15T04:30:00Z')), true);
  assert.equal(quietHoursActive('10:00', '11:00', new Date('2030-01-15T05:29:59Z')), true);
  assert.equal(quietHoursActive('10:00', '11:00', new Date('2030-01-15T05:30:00Z')), false);
});

test('overnight quiet hours cover both sides of midnight in India time', () => {
  assert.equal(quietHoursActive('22:00', '07:00', new Date('2030-01-15T16:30:00Z')), true);
  assert.equal(quietHoursActive('22:00', '07:00', new Date('2030-01-15T18:30:00Z')), true);
  assert.equal(quietHoursActive('22:00', '07:00', new Date('2030-01-16T01:29:59Z')), true);
  assert.equal(quietHoursActive('22:00', '07:00', new Date('2030-01-16T01:30:00Z')), false);
  assert.equal(quietHoursActive('22:00', '07:00', new Date('2030-01-16T10:00:00Z')), false);
});

test('unset quiet hours never suppress the badge', () => {
  assert.equal(quietHoursActive(null, null, new Date('2030-01-15T10:00:00Z')), false);
});
