import type { RouteMap } from 'void/routes';
import { api } from './api.ts';
import { navigate } from './router.tsx';

type Output<P extends keyof RouteMap, M extends keyof RouteMap[P]> = RouteMap[P][M] extends { output: infer O } ? O : never;

export type ConversationSummary = Output<'/api/messages/conversations', 'GET'>['conversations'][number];
export type ConversationDetail = Output<'/api/messages/conversations/:id', 'GET'>;
export type MessagesPage = Output<'/api/messages/conversations/:id/messages', 'GET'>;
export type ChatMessage = MessagesPage['messages'][number];
export type Mention = Output<'/api/notifications/mentions', 'GET'>['mentions'][number];

/** Dispatched on `window` when messages are read or sent, so the nav badge refreshes. */
export const MESSAGES_CHANGED = 'portal:messages-changed';

/** How often an open conversation and the conversation list poll for new messages. */
export const POLL_MS = { conversation: 10_000, list: 30_000 } as const;

export async function openDirect(personId: string) {
  const { id } = await api('/api/messages/direct', { method: 'POST', body: { personId } });
  navigate(`/messages/${id}`);
}

export async function openChannel(body: { departmentId: string } | { projectId: string }) {
  const { id } = await api('/api/messages/channels', { method: 'POST', body });
  navigate(`/messages/${id}`);
}
