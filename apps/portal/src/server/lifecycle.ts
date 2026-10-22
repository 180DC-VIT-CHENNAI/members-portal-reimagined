import type { PersonStatus } from '../../db/schema/people';

/**
 * Allowed manual status changes. "invited -> active" happens only through the
 * person's first Google sign-in, never by hand.
 */
const TRANSITIONS: Record<PersonStatus, readonly PersonStatus[]> = {
  invited: ['removed'],
  active: ['on_leave', 'suspended', 'alumni', 'removed'],
  on_leave: ['active', 'suspended', 'alumni', 'removed'],
  suspended: ['active', 'on_leave', 'alumni', 'removed'],
  alumni: ['active', 'removed'],
  removed: ['active'],
};

/**
 * Where a reinstated person lands: back to active if they have signed in
 * before, otherwise back to invited.
 */
export function nextStatus(
  from: PersonStatus,
  to: PersonStatus,
  hasSignedIn: boolean,
): { ok: true; status: PersonStatus } | { ok: false; reason: string } {
  if (from === to) return { ok: false, reason: 'unchanged' };
  if (!TRANSITIONS[from].includes(to)) return { ok: false, reason: `cannot_move_${from}_to_${to}` };
  if (to === 'active' && !hasSignedIn) return { ok: true, status: 'invited' };
  return { ok: true, status: to };
}

/** True when the status keeps sign-in access. */
export function hasAccess(status: PersonStatus): boolean {
  return status === 'active' || status === 'on_leave';
}
