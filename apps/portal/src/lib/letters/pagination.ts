/**
 * Pure page-flow planner. It knows nothing about the DOM: render.ts supplies
 * `fits` (a real layout measurement) and the split/rebuild operations, so the
 * algorithm can be unit tested with synthetic blocks.
 *
 * Guarantees when `ok`: every page satisfied `fits(page, false)`, and the last
 * page satisfied `fits(page, true)`, i.e. it fits together with the signature.
 * A block that cannot fit an empty page, even after splitting, is refused.
 */

export interface FlowOps<T extends object> {
  fits(blocks: readonly T[], withSignature: boolean): boolean;
  /** Ordered pieces an oversized block may be divided into, or null when it is atomic. */
  parts(block: T): readonly T[] | null;
  /** A copy of `block` that contains only `parts`. */
  rebuild(block: T, parts: readonly T[]): T;
  /** Split an atomic text block (paragraph, list item) at a word boundary so `head` fits; null if impossible. */
  splitInline(block: T, fits: (candidate: T) => boolean): { readonly head: T; readonly tail: T } | null;
  /** Headings are kept with the content that follows them. */
  isHeading(block: T): boolean;
}

export interface FlowOptions {
  readonly minPages: number;
  /** Optional per-page block limits (index = page number); pages without an entry are unlimited. */
  readonly maxBlocksPerPage: readonly number[];
}

export type FlowFailure = 'block-too-large' | 'signature-too-large';

export type FlowPlan<T> =
  | { readonly ok: true; readonly pages: readonly (readonly T[])[] }
  | { readonly ok: false; readonly reason: FlowFailure; readonly page: number };

interface Split<T> {
  readonly head: T;
  readonly tail: T | null;
}

function splitToFit<T extends object>(block: T, fitsWith: (candidate: T) => boolean, ops: FlowOps<T>, allowInline: boolean): Split<T> | null {
  const parts = ops.parts(block);
  if (!parts || parts.length === 0) return allowInline && !ops.isHeading(block) ? ops.splitInline(block, fitsWith) : null;
  let count = 0;
  while (count < parts.length && fitsWith(ops.rebuild(block, parts.slice(0, count + 1)))) count++;
  if (count === parts.length) return { head: block, tail: null };

  const prefix = parts.slice(0, count);
  const next = parts[count];
  if (next !== undefined && !ops.isHeading(next)) {
    const inner = splitToFit(next, (candidate) => fitsWith(ops.rebuild(block, [...prefix, candidate])), ops, allowInline);
    if (inner) {
      const tailParts = inner.tail ? [inner.tail, ...parts.slice(count + 1)] : parts.slice(count + 1);
      return { head: ops.rebuild(block, [...prefix, inner.head]), tail: tailParts.length ? ops.rebuild(block, tailParts) : null };
    }
  }
  let keep = count;
  while (keep > 0 && isHeadingAt(parts, keep - 1, ops)) keep--;
  return keep > 0 ? { head: ops.rebuild(block, parts.slice(0, keep)), tail: ops.rebuild(block, parts.slice(keep)) } : null;
}

function isHeadingAt<T extends object>(items: readonly T[], index: number, ops: FlowOps<T>): boolean {
  const item = items[index];
  return item !== undefined && ops.isHeading(item);
}

export function planFlowPages<T extends object>(blocks: readonly T[], ops: FlowOps<T>, options: FlowOptions): FlowPlan<T> {
  const pages: T[][] = [];
  let current: T[] = [];
  const queue: T[] = [...blocks];
  const limit = (): number => options.maxBlocksPerPage[pages.length] ?? Number.POSITIVE_INFINITY;
  const flush = (keepHeadingWithNext: boolean): void => {
    if (keepHeadingWithNext && current.length > 1 && isHeadingAt(current, current.length - 1, ops)) {
      const heading = current.pop();
      if (heading !== undefined) queue.unshift(heading);
    }
    pages.push(current);
    current = [];
  };

  for (let block = queue.shift(); block !== undefined; block = queue.shift()) {
    if (current.length >= limit()) {
      queue.unshift(block);
      flush(false);
      continue;
    }
    if (ops.fits([...current, block], false)) {
      current.push(block);
      continue;
    }
    const fitsFreshPage = current.length > 0 && ops.fits([block], false);
    const split = splitToFit(block, (candidate) => ops.fits([...current, candidate], false), ops, !fitsFreshPage);
    if (split) {
      current.push(split.head);
      if (split.tail) queue.unshift(split.tail);
      if (split.tail) flush(false);
      continue;
    }
    if (current.length > 0) {
      queue.unshift(block);
      flush(true);
      continue;
    }
    return { ok: false, reason: 'block-too-large', page: pages.length };
  }
  if (current.length > 0) flush(false);
  while (pages.length < Math.max(1, options.minPages)) pages.push([]);

  const last = pages[pages.length - 1] ?? [];
  if (ops.fits(last, true)) return { ok: true, pages };
  if (!ops.fits([], true)) return { ok: false, reason: 'signature-too-large', page: pages.length - 1 };

  const moved: T[] = [];
  const carry = (): void => {
    const candidate = last[last.length - 1];
    if (last.length < 2 || candidate === undefined || !ops.fits([candidate, ...moved], true)) return;
    moved.unshift(candidate);
    last.pop();
  };
  carry();
  while (moved.length > 0 && last.length > 1 && isHeadingAt(last, last.length - 1, ops)) {
    const before = moved.length;
    carry();
    if (moved.length === before) break;
  }
  pages.push(moved);
  return { ok: true, pages };
}
