/**
 * Pure board rules (design sections 9.5 and 10): label normalisation, the
 * column an item sits in, and the GitHub changes that move a card.
 * Imports only ../types.ts so `node --test` can load it.
 */
import {
  BOARD_COLUMNS,
  type BoardColumn,
  type ItemKind,
  type ItemState,
  LABELLED_COLUMNS,
  type LabelledColumn,
  STATUS_LABEL_ALIASES,
  STATUS_LABELS,
} from '../types.ts';

/** Lower-cased, every run of characters other than a-z and 0-9 replaced by one space, trimmed. */
export function normalizeLabel(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Furthest first, so several status labels resolve to the furthest column. */
const FURTHEST_FIRST: readonly LabelledColumn[] = ['in_review', 'in_progress', 'todo'];

/** The status a label name stands for, or null for an ordinary label. */
export function statusOfLabel(name: string): LabelledColumn | null {
  const normal = normalizeLabel(name);
  for (const column of FURTHEST_FIRST) {
    if ((STATUS_LABEL_ALIASES[column] as readonly string[]).includes(normal)) return column;
  }
  return null;
}

/** The furthest status among `labelNames`, or null when none is a status label. */
export function statusOf(labelNames: readonly string[]): LabelledColumn | null {
  const found = new Set(labelNames.map(statusOfLabel).filter((column): column is LabelledColumn => column !== null));
  return FURTHEST_FIRST.find((column) => found.has(column)) ?? null;
}

export interface ColumnInput {
  readonly kind: ItemKind;
  readonly state: ItemState;
  readonly draft: boolean;
  readonly labelNames: readonly string[];
  /** Issues: how many open pull requests close this issue. */
  readonly openClosingPulls: number;
}

export function columnFor(item: ColumnInput): BoardColumn {
  if (item.state === 'closed') return 'done';
  const status = statusOf(item.labelNames);
  if (status) return status;
  if (item.kind === 'pull') return item.draft ? 'in_progress' : 'in_review';
  return item.openClosingPulls > 0 ? 'in_review' : 'backlog';
}

export interface MoveItem {
  readonly state: ItemState;
  readonly labelNames: readonly string[];
}

export interface MovePlan {
  /** The status label to create in the repository when missing. */
  readonly ensureLabel: (typeof STATUS_LABELS)[LabelledColumn] | null;
  /** Label to add (null when already present). */
  readonly addLabel: string | null;
  /** Recognised status labels to remove, by their current names. */
  readonly removeLabels: readonly string[];
  /** The state change, or null to leave the state alone. */
  readonly state: { readonly state: ItemState; readonly stateReason: 'completed' | 'reopened' } | null;
}

/** The GitHub changes that move `item` into `target` (section 10.3). */
export function planMove(item: MoveItem, target: BoardColumn): MovePlan {
  const statusNames = item.labelNames.filter((name) => statusOfLabel(name) !== null);
  const reopen = item.state === 'closed' && target !== 'done' ? ({ state: 'open', stateReason: 'reopened' } as const) : null;
  if (target === 'done') {
    return {
      ensureLabel: null,
      addLabel: null,
      removeLabels: [],
      state: item.state === 'open' ? { state: 'closed', stateReason: 'completed' } : null,
    };
  }
  if (target === 'backlog') return { ensureLabel: null, addLabel: null, removeLabels: statusNames, state: reopen };
  const wanted = STATUS_LABELS[target];
  const present = item.labelNames.find((name) => name === wanted.name) ?? null;
  // A differently spelled alias of the target (e.g. "WIP") counts as the target label already.
  const alias = item.labelNames.find((name) => statusOfLabel(name) === target) ?? null;
  const keep = present ?? alias;
  return {
    ensureLabel: keep ? null : wanted,
    addLabel: keep ? null : wanted.name,
    removeLabels: statusNames.filter((name) => name !== keep),
    state: reopen,
  };
}

export function isMoveNoop(plan: MovePlan): boolean {
  return plan.ensureLabel === null && plan.addLabel === null && plan.removeLabels.length === 0 && plan.state === null;
}

export function isBoardColumn(value: string): value is BoardColumn {
  return (BOARD_COLUMNS as readonly string[]).includes(value);
}

export function isLabelledColumn(column: BoardColumn): column is LabelledColumn {
  return (LABELLED_COLUMNS as readonly string[]).includes(column);
}

export interface Sortable {
  readonly effectiveDueDate: string | null;
  readonly updatedAt: string;
  readonly closedAt: string | null;
}

/** Order within a column: due date ascending (none last), then most recently updated; Done by closing time. */
export function compareInColumn(column: BoardColumn): (a: Sortable, b: Sortable) => number {
  if (column === 'done') return (a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? '');
  return (a, b) => {
    if (a.effectiveDueDate !== b.effectiveDueDate) {
      if (a.effectiveDueDate === null) return 1;
      if (b.effectiveDueDate === null) return -1;
      return a.effectiveDueDate.localeCompare(b.effectiveDueDate);
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  };
}

/** Escapes % _ and \ for a LIKE ... ESCAPE '\' pattern. */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}
