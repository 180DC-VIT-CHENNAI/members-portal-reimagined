import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planFlowPages, type FlowOps } from './pagination.ts';

interface Block {
  readonly id: string;
  readonly height: number;
  readonly heading?: boolean;
  readonly parts?: readonly Block[];
  readonly text?: boolean;
}

const PAGE = 100;
const SIGNATURE = 20;

function heightOf(block: Block): number {
  return block.parts ? block.parts.reduce((sum, part) => sum + heightOf(part), 0) : block.height;
}

const ops: FlowOps<Block> = {
  fits: (blocks, withSignature) => blocks.reduce((sum, block) => sum + heightOf(block), 0) + (withSignature ? SIGNATURE : 0) <= PAGE,
  parts: (block) => block.parts ?? null,
  rebuild: (block, parts) => ({ id: `${block.id}[${parts.map((part) => part.id).join(',')}]`, height: 0, parts }),
  isHeading: (block) => block.heading === true,
  splitInline(block, fits) {
    if (!block.text) return null;
    for (let head = block.height - 10; head > 0; head -= 10) {
      const candidate: Block = { id: `${block.id}<${head}`, height: head, text: true };
      if (fits(candidate)) return { head: candidate, tail: { id: `${block.id}>${head}`, height: block.height - head, text: true } };
    }
    return null;
  },
};

const leaf = (id: string, height: number, heading = false): Block => ({ id, height, heading });
const paragraph = (id: string, height: number): Block => ({ id, height, text: true });
const ids = (pages: readonly (readonly Block[])[]): string[][] => pages.map((page) => page.map((block) => block.id));
const flat = { minPages: 1, maxBlocksPerPage: [] };

test('fills pages greedily and keeps the signature on a last page that fits it', () => {
  const plan = planFlowPages([leaf('a', 50), leaf('b', 40), leaf('c', 50)], ops, flat);
  assert.ok(plan.ok);
  assert.deepEqual(ids(plan.pages), [['a', 'b'], ['c']]);
});

test('moves trailing blocks to a new last page instead of clipping the signature', () => {
  const plan = planFlowPages([leaf('a', 45), leaf('b', 45)], ops, flat);
  assert.ok(plan.ok);
  assert.deepEqual(ids(plan.pages), [['a'], ['b']]);
});

test('pads to the minimum page count, signature on the final page', () => {
  const plan = planFlowPages([leaf('a', 10)], ops, { minPages: 3, maxBlocksPerPage: [] });
  assert.ok(plan.ok);
  assert.deepEqual(ids(plan.pages), [['a'], [], []]);
});

test('splits an oversized section between pages without splitting the heading off', () => {
  const section: Block = { id: 's', height: 0, parts: [leaf('h', 10, true), leaf('p1', 60), leaf('p2', 60)] };
  const plan = planFlowPages([leaf('a', 20), section], ops, flat);
  assert.ok(plan.ok);
  assert.deepEqual(ids(plan.pages), [['a', 's[h,p1]'], ['s[p2]']]);
});

test('does not leave a heading block alone at the foot of a page', () => {
  const plan = planFlowPages([leaf('a', 80), leaf('h', 10, true), leaf('b', 50)], ops, flat);
  assert.ok(plan.ok);
  assert.deepEqual(ids(plan.pages), [['a'], ['h', 'b']]);
});

test('respects per-page block limits (legacy department report spread)', () => {
  const blocks = Array.from({ length: 12 }, (_, index) => leaf(`b${index}`, 1));
  const plan = planFlowPages(blocks, ops, { minPages: 3, maxBlocksPerPage: [5, 5] });
  assert.ok(plan.ok);
  assert.deepEqual(plan.pages.map((page) => page.length), [5, 5, 2]);
});

test('keeps a heading with a split table that follows it', () => {
  const table: Block = { id: 't', height: 0, parts: Array.from({ length: 12 }, (_, index) => leaf(`r${index}`, 10)) };
  const section: Block = { id: 's', height: 0, parts: [leaf('h', 10, true), table] };
  const plan = planFlowPages([section], ops, flat);
  assert.ok(plan.ok);
  assert.deepEqual(ids(plan.pages), [['s[h,t[r0,r1,r2,r3,r4,r5,r6,r7,r8]]'], ['s[t[r9,r10,r11]]']]);
});

test('splits a paragraph taller than a page at a word boundary', () => {
  const plan = planFlowPages([leaf('a', 30), paragraph('p', 250)], ops, flat);
  assert.ok(plan.ok);
  assert.deepEqual(ids(plan.pages), [['a', 'p<70'], ['p>70<100'], ['p>70>100']]);
});

test('refuses an atomic block taller than a page instead of clipping it', () => {
  assert.deepEqual(planFlowPages([leaf('a', 10), leaf('huge', 150)], ops, flat), { ok: false, reason: 'block-too-large', page: 1 });
});

test('refuses when the signature alone cannot fit a page', () => {
  const tall: FlowOps<Block> = { ...ops, fits: (blocks, withSignature) => !withSignature && blocks.length < 2 };
  assert.deepEqual(planFlowPages([leaf('a', 1)], tall, flat), { ok: false, reason: 'signature-too-large', page: 0 });
});
