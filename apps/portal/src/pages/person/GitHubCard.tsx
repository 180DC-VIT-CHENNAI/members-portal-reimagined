import { useEffect, useState } from 'react';
import { ExternalLink, ToneBadge } from '../../components/github/parts.tsx';
import { useAction } from '../../components/github/use-action.ts';
import { Alert, Button, Card, ConfirmDialog, ErrorState, LoadingBlock, ProblemAlert } from '../../components/ui.tsx';
import { useLoad } from '../../lib/api.ts';
import { formatDate } from '../../lib/format.ts';
import { github } from '../../lib/github-client.ts';
import { isWebUrl, linkMethodLabel, linkResultNotice, parseLinkResult, tokenStatePresentation } from '../../lib/github-view.ts';
import { setQuery, useLocation } from '../../lib/router.tsx';

export function GitHubCard() {
  const me = useLoad(() => github.me(), []);
  const { query } = useLocation();
  // The GitHub round trip returns to /people/:id?github=<result>. Keep the result for this visit and clear it from the URL so a reload does not repeat it.
  const [notice, setNotice] = useState(() => {
    const result = parseLinkResult(query.get('github'));
    return result ? linkResultNotice(result) : null;
  });
  useEffect(() => {
    if (notice) setQuery({ github: null });
  }, [notice]);
  const act = useAction();
  const [confirming, setConfirming] = useState(false);

  const start = async () => {
    const outcome = await act.run('link', () => github.startLink());
    if (outcome.ok && isWebUrl(outcome.value.url)) window.location.assign(outcome.value.url);
  };
  const unlink = async () => {
    const outcome = await act.run('unlink', () => github.unlink());
    if (!outcome.ok) return;
    setConfirming(false);
    me.reload();
  };

  const data = me.data;
  const banner = notice && (
    <Alert tone={notice.tone} title={notice.title}>
      <div className="stack-sm">
        {notice.body && <p>{notice.body}</p>}
        <div>
          <Button size="sm" variant="ghost" onClick={() => setNotice(null)}>
            Dismiss
          </Button>
        </div>
      </div>
    </Alert>
  );

  if (!data) {
    if (me.problem && (me.problem.status === 403 || me.problem.status === 404)) return banner;
    return (
      <>
        {banner}
        <Card title="GitHub">{me.problem ? <ErrorState problem={me.problem} onRetry={me.reload} /> : <LoadingBlock rows={2} label="Loading GitHub link" />}</Card>
      </>
    );
  }
  if (!data.configured) return banner;

  const account = data.account;
  return (
    <>
      {banner}
      {account ? (
        <Card title="GitHub" description="Your GitHub account shows your work on My work and attributes what you write.">
          <div className="stack-sm">
            <dl className="gh-facts">
              <div>
                <dt>Account</dt>
                <dd>
                  <ExternalLink href={`https://github.com/${encodeURIComponent(account.login)}`}>@{account.login}</ExternalLink>
                </dd>
              </div>
              <div>
                <dt>Linked</dt>
                <dd>
                  {linkMethodLabel(account.method)} · {formatDate(account.linkedAt)}
                </dd>
              </div>
              <div>
                <dt>Writes</dt>
                <dd className="stack-sm">
                  <span>
                    <ToneBadge presentation={tokenStatePresentation(account.tokenState)} />
                  </span>
                  <span className="caption muted">
                    {account.actsAsYou
                      ? 'Issues and comments you write in the portal appear on GitHub under your account.'
                      : 'What you write in the portal appears on GitHub as the 180DC portal app.'}
                  </span>
                </dd>
              </div>
            </dl>
            <ProblemAlert problem={confirming ? null : act.problem} />
            <div className="cluster">
              {data.userTokensAvailable && !account.actsAsYou && (
                <Button variant="primary" icon="externalLink" busy={act.busy === 'link'} onClick={() => void start()}>
                  {account.tokenState === 'revoked' ? 'Relink to write as yourself' : 'Sign in to write as yourself'}
                </Button>
              )}
              <Button variant="danger-quiet" onClick={() => setConfirming(true)}>
                Unlink account
              </Button>
            </div>
          </div>
          <ConfirmDialog
            open={confirming}
            title="Unlink your GitHub account?"
            confirmLabel="Unlink account"
            tone="danger"
            busy={act.busy === 'unlink'}
            problem={act.problem}
            onConfirm={() => void unlink()}
            onClose={() => setConfirming(false)}
          >
            <p>My work will be empty and you cannot be assigned to issues until you link again. What you already wrote stays on GitHub.</p>
          </ConfirmDialog>
        </Card>
      ) : (
        <Card title="GitHub" description="Link your GitHub account to see your assigned issues and review requests and to be assigned on the project boards.">
          {data.linkingAvailable ? (
            <div className="stack-sm">
              <ProblemAlert problem={act.problem} />
              <div>
                <Button variant="primary" icon="externalLink" busy={act.busy === 'link'} onClick={() => void start()}>
                  Link GitHub account
                </Button>
              </div>
              <p className="hint">You sign in on GitHub and come back here.</p>
            </div>
          ) : (
            <p className="muted">Linking is not available yet. Ask an admin to link your GitHub account.</p>
          )}
        </Card>
      )}
    </>
  );
}
