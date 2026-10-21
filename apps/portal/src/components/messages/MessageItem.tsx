import { useState } from 'react';
import { relativeTime } from '../../lib/format.ts';
import type { ChatMessage } from '../../lib/message-client.ts';
import { Link } from '../../lib/router.tsx';
import { bodySegments, EDIT_WINDOW_MS, REACTIONS, type Reaction, storedTime } from '../../server/messaging-rules.ts';
import { Button, cx, TextAreaField } from '../ui.tsx';

export interface MessageActions {
  react: (message: ChatMessage, emoji: Reaction) => void;
  reply: (message: ChatMessage) => void;
  edit: (message: ChatMessage, body: string) => Promise<boolean>;
  remove: (message: ChatMessage) => void;
  report: (message: ChatMessage) => void;
}

/** Mentions render as profile links; everything else is plain text. */
export function MessageBody({ body }: { body: string }) {
  return (
    <p className="message-body">
      {bodySegments(body).map((segment, i) =>
        'mention' in segment ? (
          <Link key={i} to={`/people/${segment.personId}`} className="mention">
            @{segment.mention}
          </Link>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </p>
  );
}

export function MessageItem({ message, actions, now }: { message: ChatMessage; actions: MessageActions; now: number }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const editable = message.mine && !message.deleted && now - storedTime(message.createdAt) <= EDIT_WINDOW_MS;

  const save = async () => {
    if (editing === null) return;
    setSaving(true);
    if (await actions.edit(message, editing)) setEditing(null);
    setSaving(false);
  };

  return (
    <li className={cx('message', message.mine && 'message-mine')} id={`message-${message.id}`}>
      <div className="message-meta caption muted">
        <strong>{message.authorName}</strong> · <time dateTime={message.createdAt}>{relativeTime(message.createdAt)}</time>
        {message.editedAt && !message.deleted && ' · edited'}
      </div>
      {message.replyTo && (
        <a className="message-reply caption" href={`#message-${message.replyTo.id}`}>
          ↪ {message.replyTo.authorName}: {message.replyTo.preview ?? 'Message deleted'}
        </a>
      )}
      {message.deleted || message.body === null ? (
        <p className="message-body muted">Message deleted</p>
      ) : editing !== null ? (
        <div className="stack-sm">
          <TextAreaField label="Edit message" value={editing} maxLength={4000} onChange={(event) => setEditing(event.target.value)} />
          <div className="cluster">
            <Button size="sm" variant="primary" busy={saving} disabled={!editing.trim()} onClick={save}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <MessageBody body={message.body} />
      )}
      {!message.deleted && (
        <div className="message-actions cluster">
          {message.reactions.map((reaction) => (
            <button
              key={reaction.emoji}
              type="button"
              className={cx('reaction', reaction.mine && 'reaction-mine')}
              aria-pressed={reaction.mine}
              aria-label={`${reaction.emoji} ${reaction.count}`}
              onClick={() => actions.react(message, reaction.emoji)}
            >
              {reaction.emoji} {reaction.count}
            </button>
          ))}
          <details className="reaction-picker">
            <summary className="caption">React</summary>
            {REACTIONS.filter((emoji) => !message.reactions.some((r) => r.emoji === emoji)).map((emoji) => (
              <button key={emoji} type="button" className="reaction" aria-label={`React ${emoji}`} onClick={() => actions.react(message, emoji)}>
                {emoji}
              </button>
            ))}
          </details>
          <Button size="sm" variant="ghost" onClick={() => actions.reply(message)}>
            Reply
          </Button>
          {editable && message.body !== null && editing === null && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(message.body)}>
              Edit
            </Button>
          )}
          {message.mine ? (
            <Button size="sm" variant="danger-quiet" onClick={() => actions.remove(message)}>
              Delete
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => actions.report(message)}>
              Report
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
