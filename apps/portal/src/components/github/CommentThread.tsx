import { type FormEvent, useState } from 'react';
import { relativeTime } from '../../lib/format.ts';
import { github, mintRequestId, takeWriteNotes } from '../../lib/github-client.ts';
import { afterFailure, attemptFor, classifyWriteError, commentsErrorText, createAnyway, startAttempt, userLabel, type WriteAttempt } from '../../lib/github-view.ts';
import { GITHUB_LIMITS, type IssueDetail } from '../../server/github/types.ts';
import { Alert, Avatar, Button, Card, ProblemAlert, TextAreaField } from '../ui.tsx';
import { ExternalLink } from './parts.tsx';
import { useAction } from './use-action.ts';

interface CommentThreadProps {
  readonly issue: IssueDetail;
  readonly canComment: boolean;
  readonly onPosted: (notes: string[]) => void;
  readonly onRefresh: () => void;
}

export function CommentThread({ issue, canComment, onPosted, onRefresh }: CommentThreadProps) {
  const [body, setBody] = useState('');
  const [attempt, setAttempt] = useState<WriteAttempt>(() => startAttempt(mintRequestId));
  const { busy, problem, run } = useAction();
  const text = body.trim();
  const fingerprint = JSON.stringify([issue.id, text]);
  const comments = issue.comments;

  const send = async (next: WriteAttempt) => {
    setAttempt(next);
    const result = await run('comment', () => github.comment(issue.id, { requestId: next.requestId, body: text }));
    if (result.ok) {
      setBody('');
      setAttempt(startAttempt(mintRequestId));
      onPosted(takeWriteNotes({ attribution: result.value.attribution, ignoredAssignees: [] }));
      return;
    }
    setAttempt(afterFailure(next, classifyWriteError(result.problem), mintRequestId));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy === null && text) void send(attemptFor(attempt, fingerprint, mintRequestId));
  };

  return (
    <Card title="Comments" description={comments ? `${comments.length} on GitHub` : undefined}>
      <div className="stack">
        {comments === null ? (
          <Alert tone="warning" title="Comments are not available right now.">
            <div className="stack-sm">
              <p>{commentsErrorText(issue.commentsError ?? 'github_unavailable')}</p>
              <div>
                <Button size="sm" icon="history" onClick={onRefresh}>
                  Try again
                </Button>
              </div>
            </div>
          </Alert>
        ) : comments.length === 0 ? (
          <p className="muted">No comments yet.</p>
        ) : (
          <ul className="gh-thread">
            {comments.map((comment) => {
              const name = comment.author ? userLabel(comment.author) : 'Someone';
              return (
                <li key={comment.id} className="gh-comment">
                  <Avatar name={comment.author?.person?.fullName ?? comment.author?.login ?? name} photo={comment.author?.person?.photoKey} size={32} />
                  <div className="gh-comment-body">
                    <div className="cluster">
                      <strong>{name}</strong>
                      <ExternalLink href={comment.htmlUrl} className="caption muted">
                        {relativeTime(comment.createdAt)}
                      </ExternalLink>
                    </div>
                    <p className="gh-body">{comment.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {canComment && (
          <form className="stack-sm" onSubmit={submit}>
            <TextAreaField
              label="Add a comment"
              hint="Plain text. GitHub shows it as Markdown."
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={4}
              maxLength={GITHUB_LIMITS.bodyLength}
              disabled={attempt.unknown}
              error={problem?.fields.body}
            />
            {attempt.unknown && (
              <Alert tone="warning" title="We could not confirm whether GitHub posted this comment.">
                Check the thread first. Post it again only if it is not there.
              </Alert>
            )}
            <ProblemAlert problem={problem} fieldsShown={['body']} />
            <div className="cluster">
              {attempt.unknown ? (
                <>
                  <Button icon="history" onClick={onRefresh}>
                    Check the thread
                  </Button>
                  <Button variant="primary" busy={busy === 'comment'} onClick={() => void send(createAnyway(fingerprint, mintRequestId))}>
                    Post anyway
                  </Button>
                </>
              ) : (
                <Button type="submit" variant="primary" busy={busy === 'comment'} disabled={!text}>
                  Comment
                </Button>
              )}
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
