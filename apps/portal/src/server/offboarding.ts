import { auditLog, people, personGrants, projectMembers, projects, projectTasks, tenures } from '@schema';
import type { BatchItem } from 'drizzle-orm/batch';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { and, count, db, eq, inArray, isNull, sql } from 'void/db';
import type { Person } from './principal';

export interface OffboardingContext {
  readonly person: Person;
  /** The active person taking over owned work; null when nothing needs one. */
  readonly successorId: string | null;
  readonly actorPersonId: string;
  /** YYYY-MM-DD. */
  readonly effectiveOn: string;
}

export interface OffboardingPlan {
  /** Items this step will clean up now; 0 means the step has nothing left to do. */
  readonly count: number;
  /** True when the step reassigns work and so needs a successor. */
  readonly needsSuccessor: boolean;
  /** Unexecuted writes. They join one D1 batch, and must change nothing when re-run after success. */
  readonly statements: readonly BatchItem<'sqlite'>[];
  readonly items?: readonly { readonly id: string; readonly label: string }[];
}

/**
 * A cleanup step run when someone leaves. Later packages (mailbox grants, CRM
 * ownership, ...) add theirs with `registerOffboardingStep` at module load.
 * `plan` reads current state and returns the writes; with `successorId` null
 * it is a preview and its statements are discarded.
 */
export interface OffboardingStep {
  readonly key: string;
  readonly label: string;
  plan(context: OffboardingContext): Promise<OffboardingPlan>;
}

const registry = new Map<string, OffboardingStep>();

// Better Auth owns this table; declared here (not in db/schema) only so its rows can be deleted inside a batch.
const authSessions = sqliteTable('session', { id: text('id').primaryKey(), userId: text('userId').notNull() });

export function registerOffboardingStep(step: OffboardingStep): void {
  if (registry.has(step.key)) throw new Error(`offboarding step already registered: ${step.key}`);
  registry.set(step.key, step);
}

export function offboardingSteps(): readonly OffboardingStep[] {
  return [...registry.values()];
}

const OPEN_TASK = ['pending', 'blocked'] as const;

registerOffboardingStep({
  key: 'tasks',
  label: 'Open tasks reassigned to the successor',
  async plan({ person, successorId, actorPersonId }) {
    const open = await db
      .select({ id: projectTasks.id, projectId: projectTasks.projectId, title: projectTasks.title })
      .from(projectTasks)
      .where(and(eq(projectTasks.assigneeId, person.id), inArray(projectTasks.status, [...OPEN_TASK])));
    const items = open.map((task) => ({ id: task.id, label: task.title }));
    if (!open.length || !successorId) return { count: open.length, needsSuccessor: open.length > 0, statements: [], items };
    return {
      items,
      count: open.length,
      needsSuccessor: true,
      statements: [
        ...[...new Set(open.map((task) => task.projectId))].map((projectId) =>
          db.insert(projectMembers).values({ id: crypto.randomUUID(), projectId, personId: successorId, role: 'Handover', createdBy: actorPersonId }).onConflictDoNothing(),
        ),
        db
          .update(projectTasks)
          .set({ assigneeId: successorId, version: sql`${projectTasks.version} + 1`, updatedAt: sql`datetime('now')` })
          .where(and(eq(projectTasks.assigneeId, person.id), inArray(projectTasks.status, [...OPEN_TASK]))),
        // Keeps each task's history truthful: it is read from task.update audit entries.
        ...open.map((task) =>
          db.insert(auditLog).values({
            actorPersonId,
            action: 'task.update',
            targetType: 'task',
            targetId: task.id,
            details: { projectId: task.projectId, from: { assigneeId: person.id }, to: { assigneeId: successorId }, reason: 'offboarding' },
          }),
        ),
      ],
    };
  },
});

registerOffboardingStep({
  key: 'projects',
  label: 'Project memberships handed to the successor',
  async plan({ person, successorId, actorPersonId }) {
    const memberships = await db.select({ projectId: projectMembers.projectId, role: projectMembers.role, name: projects.name })
      .from(projectMembers).innerJoin(projects, eq(projects.id, projectMembers.projectId)).where(eq(projectMembers.personId, person.id));
    const items = memberships.map((m) => ({ id: m.projectId, label: `${m.name} (${m.role})` }));
    if (!memberships.length || !successorId) return { count: memberships.length, needsSuccessor: memberships.length > 0, statements: [], items };
    return {
      items,
      count: memberships.length,
      needsSuccessor: true,
      statements: [
        ...memberships.map((m) =>
          db
            .insert(projectMembers)
            .values({ id: crypto.randomUUID(), projectId: m.projectId, personId: successorId, role: m.role, createdBy: actorPersonId })
            .onConflictDoNothing(),
        ),
        db.delete(projectMembers).where(eq(projectMembers.personId, person.id)),
      ],
    };
  },
});

registerOffboardingStep({
  key: 'tenures',
  label: 'Current positions ended',
  async plan({ person, effectiveOn }) {
    const open = await db.select({ id: tenures.id }).from(tenures).where(and(eq(tenures.personId, person.id), isNull(tenures.endedOn)));
    return {
      count: open.length,
      needsSuccessor: false,
      statements: open.length
        ? [
            db
              .update(tenures)
              // A tenure that starts after the leaving date ends on its first day.
              .set({ endedOn: sql`CASE WHEN ${tenures.startedOn} > ${effectiveOn} THEN ${tenures.startedOn} ELSE ${effectiveOn} END` })
              .where(and(eq(tenures.personId, person.id), isNull(tenures.endedOn))),
          ]
        : [],
    };
  },
});

registerOffboardingStep({
  key: 'grants',
  label: 'Personal permission grants removed',
  async plan({ person }) {
    const grants = await db.select({ id: personGrants.id }).from(personGrants).where(eq(personGrants.personId, person.id));
    return { count: grants.length, needsSuccessor: false, statements: grants.length ? [db.delete(personGrants).where(eq(personGrants.personId, person.id))] : [] };
  },
});

registerOffboardingStep({
  key: 'sessions',
  label: 'Signed out everywhere',
  async plan({ person }) {
    if (!person.authUserId) return { count: 0, needsSuccessor: false, statements: [] };
    const [row] = await db.select({ n: count() }).from(authSessions).where(eq(authSessions.userId, person.authUserId));
    const sessions = row?.n ?? 0;
    return { count: sessions, needsSuccessor: false, statements: sessions ? [db.delete(authSessions).where(eq(authSessions.userId, person.authUserId))] : [] };
  },
});

export type OffboardingSummary = Record<string, number>;

/** Every step's pending count and whether a successor is needed, without writing. */
export async function previewOffboarding(context: Omit<OffboardingContext, 'successorId'>) {
  const plans = await Promise.all(offboardingSteps().map(async (step) => ({ step, plan: await step.plan({ ...context, successorId: null }) })));
  return {
    steps: plans.map(({ step, plan }) => ({ key: step.key, label: step.label, count: plan.count, items: [...(plan.items ?? [])] })),
    needsSuccessor: plans.some(({ plan }) => plan.needsSuccessor),
  };
}

/** Plans every step for a real run. Throws nothing; callers decide on `needsSuccessor`. */
export async function planOffboarding(context: OffboardingContext) {
  const plans = await Promise.all(offboardingSteps().map(async (step) => ({ step, plan: await step.plan(context) })));
  const summary: OffboardingSummary = {};
  for (const { step, plan } of plans) summary[step.key] = plan.count;
  return {
    summary,
    // Project roles precede task-only fallback memberships, preserving a transferred Lead role.
    statements: [...plans.filter(({ step }) => step.key === 'projects'), ...plans.filter(({ step }) => step.key !== 'projects')].flatMap(({ plan }) => plan.statements),
    needsSuccessor: plans.some(({ plan }) => plan.needsSuccessor),
    labels: plans.map(({ step, plan }) => ({ item: `${step.label} (${plan.count})`, done: true })),
  };
}

export async function activeSuccessor(successorId: string): Promise<boolean> {
  const [row] = await db.select({ id: people.id }).from(people).where(and(eq(people.id, successorId), inArray(people.status, ['active', 'on_leave'])));
  return Boolean(row);
}
