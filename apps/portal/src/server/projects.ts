import { departments, people, projectDepartments, projectMembers, projects, projectTasks, TASK_PRIORITIES, taskComments, terms } from '@schema';
import * as v from 'valibot';
import { and, asc, db, desc, eq, inArray, isNull, sql } from 'void/db';
import { enqueueEmailCampaign } from './email/queue';
import { sender } from './email/sender';
import { badRequest, forbidden, notFound } from './http';
import { can } from './permissions';
import { loadActivePrincipals, loadPersonPrincipal, type Person, type Principal } from './principal';
import { projectCreatedHtml, projectMemberHtml } from './project-email';
import { compareTasks, type ProjectAccess, projectAccess } from './project-rules';
import { calendarDate, id, optionalText } from './validation';

const singleLine = (max: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max), v.transform((value) => value.replace(/\s+/g, ' ')));

export const projectFields = {
  name: singleLine(255),
  client: optionalText(255),
  description: optionalText(5000),
  termId: v.optional(v.nullable(id)),
  deadline: v.optional(v.nullable(calendarDate)),
  departmentIds: v.pipe(v.array(id), v.minLength(1), v.maxLength(20)),
};

export const taskFields = {
  title: singleLine(255),
  description: optionalText(2000),
  assigneeId: v.optional(v.nullable(id)),
  dueDate: v.optional(v.nullable(calendarDate)),
  priority: v.optional(v.picklist(TASK_PRIORITIES)),
};

export const memberRole = singleLine(80);

export type Project = typeof projects.$inferSelect;

export interface LoadedProject {
  readonly project: Project;
  readonly departmentIds: string[];
  readonly access: ProjectAccess;
}

async function isMember(projectId: string, personId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.personId, personId)))
    .limit(1);
  return row !== undefined;
}

/** The project and the caller's rights on it; 404 when it is missing or hidden from them. */
export async function projectFor(principal: Principal, projectId: string): Promise<LoadedProject> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) notFound('project_not_found');
  const [links, member] = await Promise.all([
    db.select({ id: projectDepartments.departmentId }).from(projectDepartments).where(eq(projectDepartments.projectId, projectId)),
    isMember(projectId, principal.person.id),
  ]);
  const departmentIds = links.map((link) => link.id);
  const access = projectAccess(principal.permissions, departmentIds, member);
  if (!access.view) notFound('project_not_found');
  return { project, departmentIds, access };
}

/** 403 unless the caller holds this right on the project. */
export function requireRight(loaded: LoadedProject, right: Exclude<keyof ProjectAccess, 'view'>): void {
  if (!loaded.access[right]) forbidden();
}

/** Whether this person has access and would see the project, as an assignee must. */
export async function canSeeProject(personId: string, project: LoadedProject): Promise<boolean> {
  const [target, member] = await Promise.all([loadPersonPrincipal(personId), isMember(project.project.id, personId)]);
  return target !== null && projectAccess(target.permissions, project.departmentIds, member).view;
}

/** 400 unless every department and the term exist. */
export async function requireKnown(departmentIds: readonly string[], termId: string | null | undefined): Promise<void> {
  if (departmentIds.length) {
    const found = await db.select({ id: departments.id }).from(departments).where(inArray(departments.id, [...departmentIds]));
    if (found.length !== departmentIds.length) badRequest('unknown_department');
  }
  if (termId) {
    const [term] = await db.select({ id: terms.id }).from(terms).where(eq(terms.id, termId));
    if (!term) badRequest('unknown_term');
  }
}

export async function taskOr404(projectId: string, taskId: string) {
  const [task] = await db
    .select()
    .from(projectTasks)
    .where(and(eq(projectTasks.id, taskId), eq(projectTasks.projectId, projectId)));
  if (!task) notFound('task_not_found');
  return task;
}

/** Every project the caller can see, newest first, with departments, task progress and their rights. */
export async function listProjects(principal: Principal) {
  const [rows, links, mine, counts] = await Promise.all([
    db
      .select({ project: projects, termLabel: terms.label })
      .from(projects)
      .leftJoin(terms, eq(terms.id, projects.termId))
      .orderBy(desc(projects.createdAt), desc(projects.id)),
    db
      .select({ projectId: projectDepartments.projectId, id: departments.id, name: departments.name })
      .from(projectDepartments)
      .innerJoin(departments, eq(departments.id, projectDepartments.departmentId))
      .orderBy(asc(departments.name)),
    db
      .select({ projectId: projectMembers.projectId, role: projectMembers.role })
      .from(projectMembers)
      .where(eq(projectMembers.personId, principal.person.id)),
    db
      .select({
        projectId: projectTasks.projectId,
        total: sql<number>`count(*)`,
        completed: sql<number>`sum(${projectTasks.status} = 'completed')`,
      })
      .from(projectTasks)
      .groupBy(projectTasks.projectId),
  ]);
  const departmentsOf = new Map<string, { id: string; name: string }[]>();
  for (const { projectId, ...department } of links) departmentsOf.set(projectId, [...(departmentsOf.get(projectId) ?? []), department]);
  const roleOn = new Map(mine.map((membership) => [membership.projectId, membership.role]));
  const progress = new Map(counts.map(({ projectId, total, completed }) => [projectId, { total, completed }]));
  return rows.flatMap(({ project, termLabel }) => {
    const linked = departmentsOf.get(project.id) ?? [];
    const myRole = roleOn.get(project.id) ?? null;
    const access = projectAccess(
      principal.permissions,
      linked.map((department) => department.id),
      myRole !== null,
    );
    if (!access.view) return [];
    return [{ ...project, termLabel, departments: linked, myRole, tasks: progress.get(project.id) ?? { total: 0, completed: 0 }, access }];
  });
}

/** A project with its departments, people and tasks, as the caller may see it. */
export async function projectDetail(principal: Principal, { project, access }: LoadedProject) {
  const [term, linked, members, tasks, commentCounts] = await Promise.all([
    project.termId ? db.select({ label: terms.label }).from(terms).where(eq(terms.id, project.termId)) : Promise.resolve([]),
    db
      .select({ id: departments.id, name: departments.name })
      .from(projectDepartments)
      .innerJoin(departments, eq(departments.id, projectDepartments.departmentId))
      .where(eq(projectDepartments.projectId, project.id))
      .orderBy(asc(departments.name)),
    db
      .select({
        id: projectMembers.id,
        personId: projectMembers.personId,
        role: projectMembers.role,
        fullName: people.fullName,
        photoKey: people.photoKey,
        status: people.status,
      })
      .from(projectMembers)
      .innerJoin(people, eq(people.id, projectMembers.personId))
      .where(eq(projectMembers.projectId, project.id))
      .orderBy(asc(people.fullName)),
    db
      .select({ task: projectTasks, assigneeName: people.fullName })
      .from(projectTasks)
      .leftJoin(people, eq(people.id, projectTasks.assigneeId))
      .where(eq(projectTasks.projectId, project.id)),
    db
      .select({ taskId: taskComments.taskId, count: sql<number>`count(*)` })
      .from(taskComments)
      .innerJoin(projectTasks, eq(projectTasks.id, taskComments.taskId))
      .where(and(eq(projectTasks.projectId, project.id), isNull(taskComments.deletedAt)))
      .groupBy(taskComments.taskId),
  ]);
  const comments = new Map(commentCounts.map((row) => [row.taskId, row.count]));
  return {
    ...project,
    termLabel: term[0]?.label ?? null,
    departments: linked,
    members,
    tasks: tasks
      .map(({ task, assigneeName }) => ({
        ...task,
        assigneeName,
        comments: comments.get(task.id) ?? 0,
        canUpdateStatus: access.manageTasks || task.assigneeId === principal.person.id,
      }))
      .sort(compareTasks),
    access,
  };
}

/** Everyone with access, marked with whether they are on the project and could see it (for pickers). */
export async function projectPeople({ project, departmentIds }: LoadedProject) {
  const [everyone, memberRows] = await Promise.all([
    loadActivePrincipals(),
    db.select({ personId: projectMembers.personId }).from(projectMembers).where(eq(projectMembers.projectId, project.id)),
  ]);
  const members = new Set(memberRows.map((row) => row.personId));
  return everyone.map(({ person, permissions }) => ({
    id: person.id,
    fullName: person.fullName,
    departmentId: person.departmentId,
    member: members.has(person.id),
    canSee: projectAccess(permissions, departmentIds, members.has(person.id)).view,
  }));
}

type ProjectNotice = Pick<Project, 'id' | 'name' | 'client' | 'deadline'>;

/**
 * Queue the new-project email to the leads of its departments: people in those
 * departments who manage tasks there. Returns how many were emailed.
 */
export async function notifyProjectLeads(project: ProjectNotice, departmentIds: readonly string[], actor: Person): Promise<number> {
  const [everyone, names] = await Promise.all([
    loadActivePrincipals(),
    db.select({ name: departments.name }).from(departments).where(inArray(departments.id, [...departmentIds])).orderBy(asc(departments.name)),
  ]);
  const leads = everyone.filter(
    ({ person, permissions }) =>
      person.id !== actor.id &&
      person.departmentId !== null &&
      departmentIds.includes(person.departmentId) &&
      can(permissions, 'projects.tasks.manage', person.departmentId),
  );
  if (!leads.length) return 0;
  await enqueueEmailCampaign({
    kind: 'project',
    fromAddress: sender('180DC Admin'),
    subject: `New project: ${project.name}`,
    html: projectCreatedHtml({ ...project, departments: names.map((department) => department.name) }),
    recipients: leads.map((lead) => lead.person.email),
    meta: { projectId: project.id, replyTo: actor.email },
    createdBy: actor.id,
  });
  return leads.length;
}

/** Queue the email telling someone they were added to a project (not when they added themselves). */
export async function notifyProjectMember(project: Pick<Project, 'id' | 'name'>, person: Person, role: string, actor: Person): Promise<void> {
  if (person.id === actor.id) return;
  await enqueueEmailCampaign({
    kind: 'project',
    fromAddress: sender('180DC Admin'),
    subject: `Added to ${project.name} as ${role}`,
    html: projectMemberHtml(project.name, role),
    recipients: [person.email],
    meta: { projectId: project.id, replyTo: actor.email },
    createdBy: actor.id,
  });
}
