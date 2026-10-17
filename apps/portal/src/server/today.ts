import { announcements, emailQueue, people, projectDepartments, projectMembers, projects, projectTasks } from '@schema';
import { and, db, desc, eq, inArray, sql } from 'void/db';
import { listMeets } from './meets';
import { can } from './permissions';
import type { Principal } from './principal';
import { compareTasks, projectAccess } from './project-rules';

const TASK_LIMIT = 100;
const MEET_LIMIT = 20;
const WEEK_MS = 7 * 86_400_000;

/**
 * Open tasks assigned to this person on active projects, most urgent first.
 * Being assigned is not enough: they must still be able to see the project.
 */
async function openTasks(principal: Principal) {
  const mine = and(eq(projectTasks.assigneeId, principal.person.id), eq(projectTasks.status, 'pending'), eq(projects.status, 'active'));
  const [rows, links, memberships] = await Promise.all([
    db
      .select({
        id: projectTasks.id,
        title: projectTasks.title,
        status: projectTasks.status,
        dueDate: projectTasks.dueDate,
        priority: projectTasks.priority,
        createdAt: projectTasks.createdAt,
        projectId: projects.id,
        projectName: projects.name,
      })
      .from(projectTasks)
      .innerJoin(projects, eq(projects.id, projectTasks.projectId))
      .where(mine),
    db
      .selectDistinct({ projectId: projectDepartments.projectId, departmentId: projectDepartments.departmentId })
      .from(projectDepartments)
      .innerJoin(projectTasks, eq(projectTasks.projectId, projectDepartments.projectId))
      .innerJoin(projects, eq(projects.id, projectTasks.projectId))
      .where(mine),
    db.select({ projectId: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.personId, principal.person.id)),
  ]);
  const departmentsOf = new Map<string, string[]>();
  for (const link of links) departmentsOf.set(link.projectId, [...(departmentsOf.get(link.projectId) ?? []), link.departmentId]);
  const memberOf = new Set(memberships.map((membership) => membership.projectId));
  return rows
    .filter((task) => projectAccess(principal.permissions, departmentsOf.get(task.projectId) ?? [], memberOf.has(task.projectId)).view)
    .sort(compareTasks);
}

/** Counts of things waiting on this person, only for what they can act on. */
async function attention(principal: Principal) {
  const counts: { invited?: number; failedEmails?: number } = {};
  const inviteScope = principal.permissions.get('people.invite');
  if (inviteScope) {
    const invited = eq(people.status, 'invited');
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(people)
      .where(inviteScope === 'global' ? invited : and(invited, inArray(people.departmentId, [...inviteScope])));
    counts.invited = row?.n ?? 0;
  }
  if (can(principal.permissions, 'email.view', null)) {
    const [row] = await db.select({ n: sql<number>`count(*)` }).from(emailQueue).where(eq(emailQueue.status, 'failed'));
    counts.failedEmails = row?.n ?? 0;
  }
  return counts;
}

/** The home page: open tasks, this week's meets, the latest announcements and what needs attention. */
export async function todayFor(principal: Principal) {
  const now = Date.now();
  const [tasks, meets, latest, counts] = await Promise.all([
    openTasks(principal),
    can(principal.permissions, 'meets.view') ? listMeets(principal) : Promise.resolve([] as Awaited<ReturnType<typeof listMeets>>),
    db
      .select({ id: announcements.id, title: announcements.title, createdAt: announcements.createdAt })
      .from(announcements)
      .orderBy(desc(announcements.createdAt), desc(announcements.id))
      .limit(3),
    attention(principal),
  ]);
  const thisWeek = meets.filter((meet) => {
    const at = Date.parse(meet.scheduledAt);
    const relevant = meet.kind !== 'inter_department' || meet.departments.some((department) => can(principal.permissions, 'meets.department.view', department.id));
    return relevant && at >= now && at < now + WEEK_MS;
  });
  return {
    generatedAt: new Date(now).toISOString(),
    tasks: tasks.slice(0, TASK_LIMIT),
    hasMoreTasks: tasks.length > TASK_LIMIT,
    meets: thisWeek.slice(0, MEET_LIMIT).map(({ id, kind, title, scheduledAt, meetLink, departments }) => ({ id, kind, title, scheduledAt, meetLink, departments })),
    hasMoreMeets: thisWeek.length > MEET_LIMIT,
    announcements: latest,
    attention: counts,
  };
}
