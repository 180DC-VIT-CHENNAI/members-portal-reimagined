import { departments, type MeetKind, meetActionItems, type TaskStatus, meetDepartments, meets, people, projects, projectTasks } from '@schema';
import type { Context } from 'hono';
import { and, asc, db, eq, inArray, or, sql } from 'void/db';
import { enqueueEmailCampaign } from './email/queue';
import { sender } from './email/sender';
import { requirePermission } from './guard';
import { notFound } from './http';
import { type MeetEmail, meetEmailHtml } from './meet-email';
import { ACTIVE_STATUSES, type Person, type Principal } from './principal';
import { visibleProjects } from './project-visibility';
import { optionalText } from './validation';

const DAY_MS = 86_400_000;

/** Agenda and notes as a manager may set them; empty clears. */
export const followUpFields = { agenda: optionalText(5000), notes: optionalText(10000) };

/** The stored link, or null once the meet is more than a day past. */
const visibleLink = sql<string | null>`CASE WHEN julianday(${meets.scheduledAt}) >= julianday('now', '-1 day') THEN ${meets.meetLink} ELSE NULL END`;

/**
 * The actor allowed to manage this meet, or 401/403. Club-wide and
 * inter-department meets need a global grant; department meets need one
 * covering that department.
 */
export async function requireMeetManage(c: Context, kind: MeetKind, departmentIds: readonly string[]): Promise<Principal> {
  switch (kind) {
    case 'club':
      return requirePermission(c, 'meets.club.manage', null);
    case 'inter_department':
      return requirePermission(c, 'meets.inter_department.manage', null);
    case 'department':
      return requirePermission(c, 'meets.department.manage', departmentIds[0] ?? null);
    default: {
      const unhandled: never = kind;
      throw new Error(`Unhandled meet kind: ${String(unhandled)}`);
    }
  }
}

export async function meetOr404(id: string) {
  const [meet] = await db.select().from(meets).where(eq(meets.id, id));
  if (!meet) notFound('meet_not_found');
  const rows = await db.select({ id: meetDepartments.departmentId }).from(meetDepartments).where(eq(meetDepartments.meetId, id));
  return { meet, departmentIds: rows.map((row) => row.id) };
}

/** Club-wide and inter-department meets, plus the department meets the caller may see; earliest first. */
export async function listMeets(principal: Principal) {
  const scope = principal.permissions.get('meets.department.view');
  const departmentMeets =
    scope === 'global'
      ? eq(meets.kind, 'department')
      : scope?.size
        ? and(eq(meets.kind, 'department'), inArray(meetDepartments.departmentId, [...scope]))
        : undefined;
  const rows = await db
    .select({
      id: meets.id,
      kind: meets.kind,
      title: meets.title,
      description: meets.description,
      meetLink: visibleLink,
      agenda: meets.agenda,
      notes: meets.notes,
      scheduledAt: meets.scheduledAt,
      createdAt: meets.createdAt,
      createdBy: meets.createdBy,
      authorName: people.fullName,
      departmentId: departments.id,
      departmentName: departments.name,
    })
    .from(meets)
    .leftJoin(people, eq(people.id, meets.createdBy))
    .leftJoin(meetDepartments, eq(meetDepartments.meetId, meets.id))
    .leftJoin(departments, eq(departments.id, meetDepartments.departmentId))
    .where(or(inArray(meets.kind, ['club', 'inter_department']), departmentMeets))
    .orderBy(asc(meets.scheduledAt), asc(meets.id), asc(departments.name));
  const actionItems = await visibleActionItems(principal);
  const byId = new Map<
    string,
    Omit<(typeof rows)[number], 'departmentId' | 'departmentName'> & { departments: { id: string; name: string }[]; actionItems: ActionItem[] }
  >();
  for (const { departmentId, departmentName, ...meet } of rows) {
    const entry = byId.get(meet.id) ?? { ...meet, departments: [], actionItems: actionItems.get(meet.id) ?? [] };
    if (departmentId && departmentName) entry.departments.push({ id: departmentId, name: departmentName });
    byId.set(meet.id, entry);
  }
  return [...byId.values()];
}

export interface ActionItem {
  readonly taskId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly title: string;
  readonly status: TaskStatus;
  readonly dueDate: string | null;
}

/** Linked task labels follow current project visibility, never meeting access. */
async function visibleActionItems(principal: Principal): Promise<Map<string, ActionItem[]>> {
  const rows = await db
      .select({
        meetId: meetActionItems.meetId,
        taskId: projectTasks.id,
        projectId: projects.id,
        projectName: projects.name,
        title: projectTasks.title,
        status: projectTasks.status,
        dueDate: projectTasks.dueDate,
      })
      .from(meetActionItems)
      .innerJoin(projectTasks, eq(projectTasks.id, meetActionItems.taskId))
      .innerJoin(projects, eq(projects.id, projectTasks.projectId))
      .where(visibleProjects(principal))
      .orderBy(asc(meetActionItems.createdAt), asc(projectTasks.id));
  const byMeet = new Map<string, ActionItem[]>();
  for (const { meetId, ...item } of rows) byMeet.set(meetId, [...(byMeet.get(meetId) ?? []), item]);
  return byMeet;
}

/** The project a linked task belongs to, or 404 when the meet has no such action item. */
export async function actionItemProjectOr404(meetId: string, taskId: string): Promise<string> {
  const [row] = await db
    .select({ projectId: projectTasks.projectId })
    .from(meetActionItems)
    .innerJoin(projectTasks, eq(projectTasks.id, meetActionItems.taskId))
    .where(and(eq(meetActionItems.meetId, meetId), eq(meetActionItems.taskId, taskId)));
  return row?.projectId ?? notFound('action_item_not_found');
}

/** Everyone with access who should hear about a meet, deduplicated. */
export async function meetAudience(kind: MeetKind, departmentIds: readonly string[]): Promise<string[]> {
  const active = inArray(people.status, [...ACTIVE_STATUSES]);
  let audience;
  switch (kind) {
    case 'club':
      // As before, advisory members without a department are left out of club-wide mail.
      audience = and(active, sql`NOT (${people.accessRoleId} = 'advisory' AND ${people.departmentId} IS NULL)`);
      break;
    case 'department':
    case 'inter_department':
      audience = and(active, inArray(people.departmentId, [...departmentIds]));
      break;
    default: {
      const unhandled: never = kind;
      throw new Error(`Unhandled meet kind: ${String(unhandled)}`);
    }
  }
  const rows = await db.select({ email: people.email }).from(people).where(audience);
  return [...new Set(rows.map((row) => row.email.trim().toLowerCase()))];
}

/**
 * Queue one announcement campaign for the meet's audience. Replies go to the
 * person who scheduled or re-announced it. A meet more than a day past is
 * announced without its link, as every listing does.
 */
export async function notifyMeet(meet: MeetEmail & { readonly id: string }, departmentIds: readonly string[], actor: Person) {
  const recipients = await meetAudience(meet.kind, departmentIds);
  if (!recipients.length) return { campaignId: null, queued: 0 };
  const linkVisible = Date.parse(meet.scheduledAt) >= Date.now() - DAY_MS;
  const campaignId = await enqueueEmailCampaign({
    kind: 'meet',
    fromAddress: sender('180DC Admin'),
    subject: `New meet: ${meet.title}`,
    html: meetEmailHtml({ ...meet, meetLink: linkVisible ? meet.meetLink : null }),
    recipients,
    meta: { meetId: meet.id, replyTo: actor.email },
    createdBy: actor.id,
  });
  return { campaignId, queued: recipients.length };
}
