import * as v from 'valibot';
import { BOARD_COLUMNS, GITHUB_LIMITS } from '../types';
import { calendarDate, id, singleLine } from '../../validation';
import { markReadInput } from '../../notifications';
import { isValidLogin } from './accounts-rules';

const requestId = v.pipe(v.string(), v.uuid());
const body = v.pipe(v.string(), v.maxLength(GITHUB_LIMITS.bodyLength));
const labelName = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(GITHUB_LIMITS.labelNameLength));
const labelList = v.pipe(v.array(labelName), v.maxLength(GITHUB_LIMITS.labelsPerIssue));
const personIds = v.pipe(v.array(id), v.maxLength(GITHUB_LIMITS.assigneesPerIssue));
const milestoneNumber = v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1)));
const expectedVersion = v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)));
const dueDate = v.nullable(calendarDate);

export const createIssueInput = v.object({
  requestId,
  repositoryId: v.pipe(v.number(), v.integer()),
  title: singleLine(GITHUB_LIMITS.titleLength),
  body: v.optional(body),
  assigneePersonIds: v.optional(v.array(id)),
  labels: v.optional(labelList),
  milestoneNumber: v.optional(milestoneNumber),
  column: v.optional(v.picklist(['backlog', 'todo', 'in_progress', 'in_review'])),
  dueDate: v.optional(dueDate),
});

export const updateIssueInput = v.object({
  expectedVersion,
  title: v.optional(singleLine(GITHUB_LIMITS.titleLength)),
  body: v.optional(body),
  milestoneNumber: v.optional(milestoneNumber),
  dueDate: v.optional(dueDate),
});

export const moveIssueInput = v.object({ column: v.picklist(BOARD_COLUMNS), expectedVersion });

export const setAssigneesInput = v.object({ personIds: v.array(id), expectedVersion });

export const changeLabelsInput = v.object({ add: v.optional(labelList), remove: v.optional(labelList), expectedVersion });

export const setStateInput = v.object({
  state: v.picklist(['open', 'closed']),
  reason: v.optional(v.picklist(['completed', 'not_planned'])),
  expectedVersion,
});

export const createCommentInput = v.object({ requestId, body: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(GITHUB_LIMITS.bodyLength)) });

export const mapRepositoryInput = v.object({ projectId: v.nullable(id) });

export const syncRepositoryInput = v.object({ full: v.optional(v.boolean()) });

export const linkAccountInput = v.object({ login: v.pipe(v.string(), v.trim(), v.check(isValidLogin, 'invalid_login')) });

export const markNoticesReadInput = markReadInput;

const numericId = v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number));
const optionalText = (max: number) => v.optional(v.pipe(v.string(), v.trim(), v.maxLength(max)));
const limit = (max: number, fallback: number) =>
  v.optional(
    v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), v.minValue(1), v.transform((value) => Math.min(value, max))),
    String(fallback),
  );

export const boardQuery = v.object({
  repo: v.optional(numericId),
  assignee: optionalText(64),
  label: optionalText(GITHUB_LIMITS.labelNameLength),
  milestone: v.optional(numericId),
  q: optionalText(100),
});

export const pullsQuery = v.object({
  state: v.optional(v.picklist(['open', 'closed', 'all']), 'open'),
  repo: v.optional(numericId),
  author: v.optional(v.literal('me')),
});

export const milestonesQuery = v.object({ repo: v.optional(numericId) });

export const burndownQuery = v.object({ milestone: numericId });

export const activityQuery = v.object({ before: v.optional(numericId), limit: limit(100, 50) });

export const noticesQuery = v.object({ before: v.optional(numericId), limit: limit(50, 50) });

export const repositoriesQuery = v.object({ mapped: v.optional(v.picklist(['true', 'false'])), q: optionalText(100) });

export const deliveriesQuery = v.object({
  status: v.optional(v.picklist(['processing', 'processed', 'ignored', 'failed'])),
  cursor: optionalText(100),
  limit: limit(100, 50),
});

export const callbackQuery = v.object({ code: optionalText(512), state: optionalText(200), error: optionalText(100) });
