import type { OnboardingAckKey } from '../../db/schema/onboarding.ts';
import { can, type PermissionSet } from './permissions.ts';

export type ProfileGap = 'year' | 'branch' | 'about';

export type ChecklistItem = {
  key: 'profile' | 'department' | 'resources';
  /** `derived` items finish from real data; `acknowledge` items finish when the person marks them read. */
  kind: 'derived' | 'acknowledge';
  acknowledgment: OnboardingAckKey | null;
  title: string;
  description: string;
  href: string;
  done: boolean;
  doneAt: string | null;
  missing: ProfileGap[];
};

export type Checklist = {
  items: ChecklistItem[];
  complete: boolean;
  dismissed: boolean;
  /** Show the checklist: something is still open and the person has not hidden it. */
  visible: boolean;
};

type ProfileFields = { year: number | null; branch: string | null; bio: string | null; skills: readonly string[] | null };

/** Public profile fields still empty. Private fields (phone, reg no) are never required. */
export function profileGaps(person: ProfileFields): ProfileGap[] {
  const gaps: ProfileGap[] = [];
  if (!person.year) gaps.push('year');
  if (!person.branch?.trim()) gaps.push('branch');
  if (!person.bio?.trim() && !(person.skills ?? []).length) gaps.push('about');
  return gaps;
}

export function buildChecklist(
  person: ProfileFields & { id: string; departmentId: string | null },
  permissions: PermissionSet,
  acknowledgments: ReadonlyMap<OnboardingAckKey, string>,
): Checklist {
  const missing = profileGaps(person);
  const items: ChecklistItem[] = [{
    key: 'profile',
    kind: 'derived',
    acknowledgment: null,
    title: 'Complete your profile',
    description: 'Add your year, branch and a short bio or a few skills. Phone and registration number stay optional.',
    href: `/people/${person.id}`,
    done: missing.length === 0,
    doneAt: null,
    missing,
  }];
  const read = (key: ChecklistItem['key'], acknowledgment: OnboardingAckKey, title: string, description: string, href: string) => {
    const at = acknowledgments.get(acknowledgment) ?? null;
    items.push({ key, kind: 'acknowledge', acknowledgment, title, description, href, done: at !== null, doneAt: at, missing: [] });
  };
  const department = person.departmentId;
  if (department && (can(permissions, 'departments.instructions.view', department) || can(permissions, 'departments.workspace.view', department))) {
    read('department', 'department_read', 'Read your department page', "Your department's instructions and documents.", `/departments/${department}`);
  }
  if (can(permissions, 'files.view')) {
    read('resources', 'resources_read', 'Browse the shared club files', 'Templates and resources the club keeps for everyone.', '/files');
  }
  const complete = items.every((item) => item.done);
  const dismissed = acknowledgments.has('checklist_dismissed');
  return { items, complete, dismissed, visible: !complete && !dismissed };
}

/** Acknowledgments this person may record: the read items shown to them, and hiding the checklist. */
export function allowedAcknowledgments(checklist: Checklist): Set<OnboardingAckKey> {
  const allowed = new Set<OnboardingAckKey>(['checklist_dismissed']);
  for (const item of checklist.items) if (item.acknowledgment) allowed.add(item.acknowledgment);
  return allowed;
}
