import { conversationMembers, conversations, departments, people, projectDepartments, projectMembers, projects } from '@schema';
import type { SQL } from 'drizzle-orm';
import * as v from 'valibot';
import { and, asc, db, eq, inArray, isNotNull, or, sql } from 'void/db';
import { badRequest, notFound } from '../http';
import { directKey } from '../messaging-rules.ts';
import { can } from '../permissions';
import { ACTIVE_STATUSES, loadActivePrincipals, type Principal } from '../principal';
import { projectAccess } from '../project-rules';
import { visibleProjects } from '../project-visibility';
import { id } from '../validation';

const ACTIVE = sql.raw(ACTIVE_STATUSES.map((status) => `'${status}'`).join(', '));

/** Departments whose channel the caller may read: their own, and any their `departments.workspace.view` covers. */
function departmentScope(principal: Principal): 'global' | string[] {
  const scope = principal.permissions.get('departments.workspace.view');
  if (scope === 'global') return 'global';
  const ids = new Set(scope ?? []);
  if (principal.person.departmentId) ids.add(principal.person.departmentId);
  return [...ids];
}

/**
 * SQL over `conversations`: the rows the caller may read right now. Direct
 * conversations need a participant row; department channels follow home
 * department or `departments.workspace.view`; project channels follow
 * `visibleProjects`, the same rule as the project list. Every list, count,
 * search, notice and detail query goes through this predicate.
 */
export function accessibleConversations(principal: Principal): SQL {
  const departmentsIn = departmentScope(principal);
  const projectVisible = visibleProjects(principal);
  return or(
    and(
      eq(conversations.kind, 'direct'),
      sql`exists (select 1 from ${conversationMembers} where ${conversationMembers.conversationId} = ${conversations.id} and ${conversationMembers.personId} = ${principal.person.id})`,
    ),
    departmentsIn === 'global'
      ? and(eq(conversations.kind, 'department'), isNotNull(conversations.departmentId))
      : departmentsIn.length
        ? and(eq(conversations.kind, 'department'), inArray(conversations.departmentId, departmentsIn))
        : undefined,
    projectVisible
      ? and(eq(conversations.kind, 'project'), sql`exists (select 1 from ${projects} where ${projects.id} = ${conversations.projectId} and ${projectVisible})`)
      : undefined,
  ) ?? sql`0`;
}

const counterpart = (principal: Principal, column: SQL) => sql`(select ${column} from ${conversationMembers}
  join ${people} on ${people.id} = ${conversationMembers.personId}
  where ${conversationMembers.conversationId} = ${conversations.id} and ${conversationMembers.personId} <> ${principal.person.id})`;

/**
 * Drizzle drops table names from top-level column refs of a selected field when
 * a query has no joins; refs inside a nested fragment keep them. Correlated
 * subqueries must stay qualified, so they are wrapped.
 */
const qualified = <T>(fragment: SQL) => sql<T>`${fragment}`;

/** Columns describing a conversation from the caller's point of view. */
export function conversationColumns(principal: Principal) {
  return {
    id: conversations.id,
    kind: conversations.kind,
    departmentId: conversations.departmentId,
    projectId: conversations.projectId,
    lastMessageId: conversations.lastMessageId,
    title: qualified<string>(sql`case ${conversations.kind}
      when 'department' then (select ${departments.name} from ${departments} where ${departments.id} = ${conversations.departmentId})
      when 'project' then (select ${projects.name} from ${projects} where ${projects.id} = ${conversations.projectId})
      else ${counterpart(principal, sql`${people.fullName}`)} end`),
    counterpartId: sql<string | null>`case ${conversations.kind} when 'direct' then ${counterpart(principal, sql`${people.id}`)} end`,
    counterpartActive: sql<number>`case ${conversations.kind} when 'direct'
      then coalesce(${counterpart(principal, sql`${people.status} in (${ACTIVE})`)}, 0) else 1 end`,
    muted: qualified<number>(sql`coalesce((select ${conversationMembers.muted} from ${conversationMembers}
      where ${conversationMembers.conversationId} = ${conversations.id} and ${conversationMembers.personId} = ${principal.person.id}), 0)`),
    lastRead: qualified<number>(sql`coalesce((select ${conversationMembers.lastReadMessageId} from ${conversationMembers}
      where ${conversationMembers.conversationId} = ${conversations.id} and ${conversationMembers.personId} = ${principal.person.id}), 0)`),
  };
}

export type Conversation = Awaited<ReturnType<typeof conversationFor>>;

/** The conversation if the caller may read it now, else 404 (whether or not it exists). */
export async function conversationFor(principal: Principal, conversationId: string) {
  const [row] = await db
    .select(conversationColumns(principal))
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), accessibleConversations(principal)))
    .limit(1);
  if (!row) notFound('conversation_not_found');
  return { ...row, muted: Boolean(row.muted), canSend: Boolean(row.counterpartActive) };
}

/** True when `principal` may read the conversation now. */
export async function canRead(principal: Principal, conversationId: string): Promise<boolean> {
  const rows = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), accessibleConversations(principal)))
    .limit(1);
  return rows.length > 0;
}

export const directInput = v.object({ personId: id });

/** Find or start the direct conversation with another current member (404 for anyone else). */
export async function openDirect(principal: Principal, personId: string): Promise<{ id: string }> {
  if (personId === principal.person.id) badRequest('cannot_message_self');
  const [other] = await db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.id, personId), inArray(people.status, [...ACTIVE_STATUSES])))
    .limit(1);
  if (!other) notFound('person_not_found');
  const key = directKey(principal.person.id, other.id);
  await db.insert(conversations).values({ id: crypto.randomUUID(), kind: 'direct', directKey: key, createdBy: principal.person.id }).onConflictDoNothing();
  const [row] = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.directKey, key));
  await db
    .insert(conversationMembers)
    .values([principal.person.id, other.id].map((personId) => ({ conversationId: row.id, personId })))
    .onConflictDoNothing();
  return { id: row.id };
}

export const channelInput = v.union([v.object({ departmentId: id }), v.object({ projectId: id })]);

/** Find or create the department or project channel, if the caller may read it (404 otherwise). */
export async function openChannel(principal: Principal, input: v.InferOutput<typeof channelInput>): Promise<{ id: string }> {
  if ('departmentId' in input) {
    const scope = departmentScope(principal);
    const [department] = await db.select({ id: departments.id }).from(departments).where(eq(departments.id, input.departmentId)).limit(1);
    if (!department || (scope !== 'global' && !scope.includes(department.id))) notFound('department_not_found');
    await db.insert(conversations).values({ id: crypto.randomUUID(), kind: 'department', departmentId: department.id, createdBy: principal.person.id }).onConflictDoNothing();
    const [row] = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.departmentId, department.id));
    return { id: row.id };
  }
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, input.projectId), visibleProjects(principal) ?? sql`0`))
    .limit(1);
  if (!project) notFound('project_not_found');
  await db.insert(conversations).values({ id: crypto.randomUUID(), kind: 'project', projectId: project.id, createdBy: principal.person.id }).onConflictDoNothing();
  const [row] = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.projectId, project.id));
  return { id: row.id };
}

/**
 * Current members who can read the conversation, for the mention picker. The
 * same rules as `accessibleConversations`, evaluated in memory per person.
 */
export async function mentionCandidates(conversation: Conversation) {
  const principals = await loadActivePrincipals();
  let readers: Principal[];
  switch (conversation.kind) {
    case 'direct': {
      const ids = new Set(
        (await db.select({ personId: conversationMembers.personId }).from(conversationMembers).where(eq(conversationMembers.conversationId, conversation.id))).map(
          (row) => row.personId,
        ),
      );
      readers = principals.filter((p) => ids.has(p.person.id));
      break;
    }
    case 'department': {
      const departmentId = conversation.departmentId;
      readers = principals.filter((p) => p.person.departmentId === departmentId || can(p.permissions, 'departments.workspace.view', departmentId));
      break;
    }
    case 'project': {
      const projectId = conversation.projectId ?? '';
      const [[project], links, members] = await Promise.all([
        db.select({ internal: projects.internal }).from(projects).where(eq(projects.id, projectId)),
        db.select({ departmentId: projectDepartments.departmentId }).from(projectDepartments).where(eq(projectDepartments.projectId, projectId)),
        db.select({ personId: projectMembers.personId }).from(projectMembers).where(eq(projectMembers.projectId, projectId)),
      ]);
      const departmentIds = links.map((link) => link.departmentId);
      const named = new Set(members.map((member) => member.personId));
      readers = project
        ? principals.filter((p) => projectAccess(p.permissions, departmentIds, named.has(p.person.id), project.internal).view)
        : [];
      break;
    }
    default: {
      const unhandled: never = conversation.kind;
      throw new Error(`Unhandled conversation kind: ${String(unhandled)}`);
    }
  }
  return readers.slice(0, 200).map((p) => ({ id: p.person.id, fullName: p.person.fullName }));
}

/** Conversations the caller can read that have messages (or are direct), newest activity first, at most 100. */
export async function listConversations(principal: Principal) {
  const columns = conversationColumns(principal);
  const rows = await db
    .select({
      ...columns,
      lastAt: sql<string | null>`(select m.created_at from messages m where m.id = conversations.last_message_id)`,
      lastBody: sql<string | null>`(select case when m.deleted_at is null then m.body end from messages m where m.id = conversations.last_message_id)`,
      unread: sql<number>`(select count(*) from (select 1 from messages m where m.conversation_id = conversations.id
        and m.id > ${columns.lastRead} and m.author_id <> ${principal.person.id} and m.deleted_at is null limit 100))`,
    })
    .from(conversations)
    .where(and(accessibleConversations(principal), or(isNotNull(conversations.lastMessageId), eq(conversations.kind, 'direct'))))
    .orderBy(sql`coalesce(${conversations.lastMessageId}, 0) desc`, asc(conversations.id))
    .limit(100);
  return rows.map(({ lastRead, counterpartActive, muted, unread, ...row }) => ({
    ...row,
    muted: Boolean(muted),
    canSend: Boolean(counterpartActive),
    unread: Math.min(unread, 99),
    unreadCapped: unread > 99,
  }));
}
