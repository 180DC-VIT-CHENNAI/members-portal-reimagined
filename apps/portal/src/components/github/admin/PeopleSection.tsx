import { type FormEvent, useState } from 'react';
import { api, useLoad } from '../../../lib/api.ts';
import { relativeTime } from '../../../lib/format.ts';
import { github } from '../../../lib/github-client.ts';
import { cleanLogin, isLogin, linkMethodLabel, tokenStatePresentation } from '../../../lib/github-view.ts';
import type { AccountLinkView } from '../../../server/github/types.ts';
import { Alert, Button, Card, ConfirmDialog, EmptyState, ErrorState, LoadingBlock, ProblemAlert, SelectField, TextField } from '../../ui.tsx';
import { ExternalLink, ToneBadge } from '../parts.tsx';
import { useAction } from '../use-action.ts';

const profileUrl = (login: string) => `https://github.com/${encodeURIComponent(login)}`;

export function PeopleSection() {
  const accounts = useLoad(() => github.accounts(), []);
  const people = useLoad(() => api('/api/people', { query: {} }), []);
  const act = useAction();
  const [personId, setPersonId] = useState('');
  const [login, setLogin] = useState('');
  const [unlinking, setUnlinking] = useState<AccountLinkView | null>(null);

  const cleaned = cleanLogin(login);
  const loginValid = isLogin(cleaned);
  const pending = act.busy !== null;
  const data = accounts.data;

  if (!data) {
    return <Card flush>{accounts.problem ? <ErrorState problem={accounts.problem} onRetry={accounts.reload} /> : <LoadingBlock rows={4} label="Loading linked accounts" />}</Card>;
  }

  const linkedIds = new Set(data.links.map((link) => link.person.id));
  const candidates = (people.data ?? []).filter((person) => !linkedIds.has(person.id));

  const link = async (person: string, name: string) => {
    const result = await act.run(`link:${person}`, () => github.linkAccount(person, name));
    if (result.ok) accounts.reload();
    return result.ok;
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || !personId || !loginValid) return;
    if (await link(personId, cleaned)) {
      setPersonId('');
      setLogin('');
    }
  };
  const confirmUnlink = async () => {
    if (!unlinking) return;
    const result = await act.run(`unlink:${unlinking.person.id}`, () => github.unlinkAccount(unlinking.person.id));
    if (!result.ok) return;
    setUnlinking(null);
    accounts.reload();
  };

  return (
    <div className="stack">
      <ProblemAlert problem={unlinking ? null : act.problem} />
      <Card title="Link a member" description="Link a member to their GitHub account on their behalf. Members can also link their own account from their profile.">
        {people.problem ? (
          <Alert tone="info" title="The member list is not available to you.">
            Ask a member to link their own account from their profile, or ask someone who can see the directory.
          </Alert>
        ) : (
          <form className="gha-form" onSubmit={(event) => void submit(event)}>
            <SelectField label="Member" value={personId} onChange={(event) => setPersonId(event.target.value)} disabled={!people.data}>
              <option value="">Choose a member</option>
              {candidates.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName}
                </option>
              ))}
            </SelectField>
            <TextField
              label="GitHub username"
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              placeholder="octocat"
              autoComplete="off"
              error={login.trim() !== '' && !loginValid ? 'Enter a GitHub username like octocat, or paste the profile link.' : undefined}
            />
            <div>
              <Button type="submit" variant="primary" busy={act.busy !== null && act.busy.startsWith('link:')} disabled={pending || !personId || !loginValid}>
                Link account
              </Button>
            </div>
          </form>
        )}
      </Card>
      {data.suggestions.length > 0 && (
        <Card flush title="Suggested links" description="Taken from the GitHub address on a member's profile. Nothing is linked until you confirm it.">
          <div className="table-wrap">
            <table className="table table-stack">
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  <th scope="col">GitHub username</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.suggestions.map((suggestion) => (
                  <tr key={suggestion.person.id}>
                    <td className="cell-primary">{suggestion.person.fullName}</td>
                    <td data-label="GitHub username">
                      <ExternalLink href={profileUrl(suggestion.login)}>@{suggestion.login}</ExternalLink>
                    </td>
                    <td data-label="Action">
                      <Button size="sm" busy={act.busy === `link:${suggestion.person.id}`} disabled={pending} onClick={() => void link(suggestion.person.id, suggestion.login)}>
                        Link
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {data.unmatched.length > 0 && (
        <Card flush title="GitHub users not linked to a member" description="They appear on items in the mapped repositories.">
          <div className="table-wrap">
            <table className="table table-stack">
              <thead>
                <tr>
                  <th scope="col">GitHub username</th>
                  <th scope="col">Open items</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.unmatched.map((user) => (
                  <tr key={user.githubUserId}>
                    <td className="cell-primary">
                      <ExternalLink href={profileUrl(user.login)}>@{user.login}</ExternalLink>
                    </td>
                    <td data-label="Open items">{user.openItems}</td>
                    <td data-label="Action">
                      <Button size="sm" onClick={() => setLogin(user.login)}>
                        Use this username
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Card flush title="Linked accounts" description={`${data.links.length} ${data.links.length === 1 ? 'member is' : 'members are'} linked.`}>
        {data.links.length === 0 ? (
          <EmptyState icon="users" title="No accounts are linked yet">
            Linked members see their own work on My work and can be assigned to issues.
          </EmptyState>
        ) : (
          <div className="table-wrap" aria-busy={accounts.loading || undefined}>
            <table className="table table-stack">
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  <th scope="col">GitHub</th>
                  <th scope="col">Linked</th>
                  <th scope="col">Writes</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.links.map((entry) => (
                  <tr key={entry.person.id}>
                    <td className="cell-primary">
                      {entry.person.fullName}
                      <div className="caption muted wrap-anywhere">{entry.person.email}</div>
                    </td>
                    <td data-label="GitHub">
                      <ExternalLink href={profileUrl(entry.login)}>@{entry.login}</ExternalLink>
                      {!entry.verified && <span className="badge">Unverified</span>}
                    </td>
                    <td data-label="Linked">
                      {linkMethodLabel(entry.method)}
                      <div className="caption muted">{relativeTime(entry.linkedAt)}</div>
                    </td>
                    <td data-label="Writes">
                      <ToneBadge presentation={tokenStatePresentation(entry.tokenState)} />
                    </td>
                    <td data-label="Action">
                      <Button size="sm" variant="danger-quiet" disabled={pending} onClick={() => setUnlinking(entry)}>
                        Unlink
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <ConfirmDialog
        open={unlinking !== null}
        title="Unlink this account?"
        confirmLabel="Unlink account"
        tone="danger"
        busy={pending}
        problem={act.problem}
        onConfirm={() => void confirmUnlink()}
        onClose={() => setUnlinking(null)}
      >
        <p>
          {unlinking?.person.fullName} will lose their My work page and can no longer be assigned to issues until they link @{unlinking?.login} again. Their saved writes
          stay on GitHub.
        </p>
      </ConfirmDialog>
    </div>
  );
}
