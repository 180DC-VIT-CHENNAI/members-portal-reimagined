import type { PersonStatus } from './types.ts';

export const STATUS_ORDER: readonly PersonStatus[] = ['active', 'invited', 'on_leave', 'suspended', 'alumni', 'removed'];

export const STATUS_LABEL: Record<PersonStatus, string> = {
  invited: 'Invited',
  active: 'Active',
  on_leave: 'On leave',
  suspended: 'Suspended',
  alumni: 'Alumni',
  removed: 'Removed',
};

export const TRANSITIONS: Record<PersonStatus, readonly PersonStatus[]> = {
  invited: ['removed'],
  active: ['on_leave', 'suspended', 'alumni', 'removed'],
  on_leave: ['active', 'suspended', 'alumni', 'removed'],
  suspended: ['active', 'on_leave', 'alumni', 'removed'],
  alumni: ['active', 'removed'],
  removed: ['active'],
};

export function isStatus(value: string): value is PersonStatus {
  return Object.hasOwn(STATUS_LABEL, value);
}

function parseDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00`);
  return new Date(`${value.replace(' ', 'T')}${/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? '' : 'Z'}`);
}

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = parseDate(value);
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
}

export function formatDateTime(value: string): string {
  const date = parseDate(value);
  return Number.isNaN(date.getTime()) ? value : dateTimeFormat.format(date);
}

export function relativeTime(value: string): string {
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return value;
  const seconds = (date.getTime() - Date.now()) / 1000;
  const abs = Math.abs(seconds);
  if (abs < 45) return 'just now';
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), 'hour');
  if (abs < 86_400 * 7) return relative.format(Math.round(seconds / 86_400), 'day');
  return dateFormat.format(date);
}

export function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

export function isHttpsUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function lookupName<T extends { id: string }>(items: readonly T[] | undefined, id: string | null | undefined, name: (item: T) => string): string | null {
  if (!id) return null;
  const item = items?.find((candidate) => candidate.id === id);
  return item ? name(item) : id;
}
