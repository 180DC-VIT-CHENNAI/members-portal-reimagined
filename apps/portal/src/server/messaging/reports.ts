import { conversations, departments, messageReports, messages, people, projects } from '@schema';
import { alias } from 'drizzle-orm/sqlite-core';
import * as v from 'valibot';
import { and, db, desc, eq, sql } from 'void/db';
import { badRequest, conflict, notFound } from '../http';
import { plainText } from '../messaging-rules.ts';
import type { Principal } from '../principal';
import { tombstone } from './messages';

export const reportInput = v.object({ reason: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)) });
export const resolveInput = v.object({ action: v.picklist(['dismiss', 'remove']) });

/** Report someone else's live message; reporting it again is a no-op. */
export async function reportMessage(principal: Principal, message: typeof messages.$inferSelect, reason: string) {
  if (message.authorId === principal.person.id) badRequest('cannot_report_own_message');
  if (message.deletedAt) conflict('message_deleted');
  await db.insert(messageReports).values({ messageId: message.id, reporterId: principal.person.id, reason }).onConflictDoNothing();
  return { reported: true };
}

const reporter = alias(people, 'reporter');

/**
 * Open reports, newest first, for holders of `chat.moderate`. Moderators see
 * the reported message's current text (null once removed) and where it was
 * posted, but not the rest of the conversation.
 */
export async function openReports() {
  const rows = await db
    .select({
      id: messageReports.id,
      reason: messageReports.reason,
      createdAt: messageReports.createdAt,
      reporterName: reporter.fullName,
      messageId: messages.id,
      authorName: people.fullName,
      body: messages.body,
      deletedAt: messages.deletedAt,
      conversationKind: conversations.kind,
      context: sql<string | null>`case ${conversations.kind}
        when 'department' then (select ${departments.name} from ${departments} where ${departments.id} = ${conversations.departmentId})
        when 'project' then (select ${projects.name} from ${projects} where ${projects.id} = ${conversations.projectId}) end`,
    })
    .from(messageReports)
    .innerJoin(messages, eq(messages.id, messageReports.messageId))
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .innerJoin(people, eq(people.id, messages.authorId))
    .innerJoin(reporter, eq(reporter.id, messageReports.reporterId))
    .where(eq(messageReports.status, 'open'))
    .orderBy(desc(messageReports.id))
    .limit(100);
  return {
    reports: rows.map(({ body, deletedAt, ...row }) => ({ ...row, body: deletedAt ? null : plainText(body) })),
  };
}

/** Close every open report on the reported message; `remove` also tombstones it. Audited without the text. */
export async function resolveReport(principal: Principal, reportId: number, action: v.InferOutput<typeof resolveInput>['action']) {
  const [report] = Number.isSafeInteger(reportId)
    ? await db
        .select({ messageId: messageReports.messageId, conversationId: messages.conversationId })
        .from(messageReports)
        .innerJoin(messages, eq(messages.id, messageReports.messageId))
        .where(eq(messageReports.id, reportId))
    : [];
  if (!report) notFound('report_not_found');
  if (action === 'remove') await tombstone(report.messageId, { actorId: principal.person.id, conversationId: report.conversationId });
  await db
    .update(messageReports)
    .set({ status: 'resolved', resolvedBy: principal.person.id, resolvedAt: new Date().toISOString() })
    .where(and(eq(messageReports.messageId, report.messageId), eq(messageReports.status, 'open')));
  return { resolved: true };
}
