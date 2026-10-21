import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { NOTIFICATIONS_CHANGED } from '../components/NotificationLink.tsx';
import { type MessageActions, MessageItem } from '../components/messages/MessageItem.tsx';
import { BackLink, Button, ConfirmDialog, Dialog, ErrorState, LoadingBlock, PageHeader, ProblemAlert, SelectField, TextAreaField } from '../components/ui.tsx';
import { api, problemFrom, useLoad } from '../lib/api.ts';
import type { ApiProblem } from '../lib/errors.ts';
import { type ChatMessage, MESSAGES_CHANGED, POLL_MS } from '../lib/message-client.ts';
import { Link } from '../lib/router.tsx';
import { MESSAGE_MAX_LENGTH, plainText } from '../server/messaging-rules.ts';
import '../messaging.css';

const byId = (a: ChatMessage, b: ChatMessage) => a.id - b.id;

/** One conversation: messages oldest to newest, polled while the tab is visible, with a composer. */
export function ConversationPage({ id }: { id: string }) {
  const detail = useLoad(() => api('/api/messages/conversations/:id', { params: { id } }), [id]);
  const people = useLoad(() => api('/api/messages/conversations/:id/people', { params: { id } }), [id]);
  const [messages, setMessages] = useState<Map<number, ChatMessage>>(new Map());
  const [older, setOlder] = useState<number | null | undefined>(undefined);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ChatMessage | null>(null);
  const [reporting, setReporting] = useState<ChatMessage | null>(null);
  const [reason, setReason] = useState('');
  const [now, setNow] = useState(Date.now());
  const readUpTo = useRef(0);

  const merge = useCallback((rows: readonly ChatMessage[]) => {
    setMessages((prev) => {
      const next = new Map(prev);
      for (const row of rows) next.set(row.id, row);
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const page = await api('/api/messages/conversations/:id/messages', { params: { id }, query: {} });
      merge(page.messages);
      setOlder((prev) => (prev === undefined ? page.nextBefore : prev));
      setNow(Date.now());
      const newest = page.messages[0]?.id ?? 0;
      if (newest > readUpTo.current) {
        await api('/api/messages/conversations/:id/read', { method: 'POST', params: { id }, body: { upTo: newest } });
        readUpTo.current = newest;
        window.dispatchEvent(new Event(MESSAGES_CHANGED));
        window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
      }
    } catch (err) {
      const failure = problemFrom(err);
      if (failure.status === 404 || failure.status === 401) setMessages(new Map());
      setProblem(failure);
    }
  }, [id, merge]);

  useEffect(() => {
    setMessages(new Map());
    setOlder(undefined);
    readUpTo.current = 0;
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS.conversation);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const act = async (key: string, run: () => Promise<unknown>) => {
    setBusy(key);
    setProblem(null);
    try {
      await run();
      return true;
    } catch (err) {
      setProblem(problemFrom(err));
      return false;
    } finally {
      setBusy(null);
    }
  };
  const messagePath = (message: ChatMessage) => ({ id, messageId: String(message.id) });

  const actions: MessageActions = {
    react: (message, emoji) =>
      void act(`react-${message.id}`, async () => {
        const { reactions } = await api('/api/messages/conversations/:id/messages/:messageId/reactions', { method: 'POST', params: messagePath(message), body: { emoji } });
        merge([{ ...message, reactions }]);
      }),
    reply: (message) => setReplyTo(message),
    edit: (message, body) =>
      act(`edit-${message.id}`, async () => {
        await api('/api/messages/conversations/:id/messages/:messageId', { method: 'PATCH', params: messagePath(message), body: { body } });
        await refresh();
      }),
    remove: (message) => setRemoving(message),
    report: (message) => {
      setReason('');
      setReporting(message);
    },
  };

  const send = (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    void act('send', async () => {
      await api('/api/messages/conversations/:id/messages', {
        method: 'POST',
        params: { id },
        body: { requestId: crypto.randomUUID(), body, ...(replyTo ? { replyToId: replyTo.id } : {}) },
      });
      setDraft('');
      setReplyTo(null);
      await refresh();
    });
  };
  const loadOlder = () =>
    older &&
    act('older', async () => {
      const page = await api('/api/messages/conversations/:id/messages', { params: { id }, query: { before: String(older) } });
      merge(page.messages);
      setOlder(page.nextBefore);
    });
  const mention = (personId: string) => {
    const person = people.data?.people.find((p) => p.id === personId);
    if (person) setDraft((text) => `${text}${text && !text.endsWith(' ') ? ' ' : ''}@[${person.fullName}](${person.id}) `);
  };

  if (detail.problem) return <ErrorState problem={detail.problem} onRetry={detail.reload} title="This conversation isn't available" />;
  const c = detail.data;
  if (!c) return <LoadingBlock />;
  const context =
    c.kind === 'project' && c.projectId ? <Link to={`/projects/${c.projectId}`}>Open project</Link>
    : c.kind === 'department' && c.departmentId ? <Link to={`/departments/${c.departmentId}`}>Open department</Link>
    : c.counterpartId ? <Link to={`/people/${c.counterpartId}`}>View profile</Link>
    : null;
  const ordered = [...messages.values()].sort(byId);

  return (
    <div className="page page-narrow conversation">
      <BackLink to="/messages">Messages</BackLink>
      <PageHeader
        overline={c.kind === 'direct' ? 'Direct message' : c.kind === 'project' ? 'Project channel' : 'Department channel'}
        title={c.title ?? 'Conversation'}
        actions={
          <div className="cluster">
            {context}
            <Button
              size="sm"
              aria-pressed={c.muted}
              busy={busy === 'mute'}
              onClick={() => act('mute', async () => {
                await api('/api/messages/conversations/:id/mute', { method: 'PUT', params: { id }, body: { muted: !c.muted } });
                detail.reload();
                window.dispatchEvent(new Event(MESSAGES_CHANGED));
              })}
            >
              {c.muted ? 'Unmute' : 'Mute'}
            </Button>
          </div>
        }
      />
      <ProblemAlert problem={problem} />
      {older ? (
        <Button size="sm" busy={busy === 'older'} onClick={loadOlder}>
          Load older messages
        </Button>
      ) : null}
      {ordered.length === 0 ? (
        <p className="muted">No messages yet. Say hello.</p>
      ) : (
        <ol className="message-list" aria-label="Messages" aria-live="polite">
          {ordered.map((message) => (
            <MessageItem key={message.id} message={message} actions={actions} now={now} />
          ))}
        </ol>
      )}
      {c.canSend ? (
        <form className="composer stack-sm" onSubmit={send}>
          {replyTo && (
            <div className="cluster caption">
              Replying to {replyTo.authorName}: {replyTo.body ? plainText(replyTo.body).slice(0, 80) : 'deleted message'}
              <Button size="sm" variant="ghost" onClick={() => setReplyTo(null)}>
                Cancel reply
              </Button>
            </div>
          )}
          <TextAreaField
            label="Message"
            value={draft}
            maxLength={MESSAGE_MAX_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) send(event);
            }}
            hint="Plain text. Ctrl+Enter sends."
          />
          <div className="cluster">
            {people.data && people.data.people.length > 0 && (
              <SelectField label="Mention" value="" onChange={(event) => mention(event.target.value)}>
                <option value="">Mention someone…</option>
                {people.data.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </SelectField>
            )}
            <Button type="submit" variant="primary" icon="messageSquare" busy={busy === 'send'} disabled={!draft.trim()}>
              Send
            </Button>
          </div>
        </form>
      ) : (
        <p className="muted">This conversation is read only: the other person no longer has access to the portal.</p>
      )}
      <ConfirmDialog
        open={removing !== null}
        title="Delete this message?"
        confirmLabel="Delete"
        tone="danger"
        busy={busy === 'remove'}
        problem={problem}
        onClose={() => setRemoving(null)}
        onConfirm={() =>
          removing &&
          void act('remove', async () => {
            await api('/api/messages/conversations/:id/messages/:messageId', { method: 'DELETE', params: messagePath(removing) });
            setRemoving(null);
            await refresh();
          })
        }
      >
        <p>Its text is erased for everyone. Others see that a message was deleted.</p>
      </ConfirmDialog>
      <Dialog open={reporting !== null} title="Report this message" onClose={() => setReporting(null)}>
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (reporting)
              void act('report', async () => {
                await api('/api/messages/conversations/:id/messages/:messageId/report', { method: 'POST', params: messagePath(reporting), body: { reason } });
                setReporting(null);
              });
          }}
        >
          <TextAreaField label="What is wrong with it?" value={reason} maxLength={500} required onChange={(event) => setReason(event.target.value)} />
          <p className="caption muted">Moderators see the message and your reason, not the rest of the conversation.</p>
          <div className="dialog-actions">
            <Button variant="ghost" onClick={() => setReporting(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" busy={busy === 'report'} disabled={!reason.trim()}>
              Report
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
