import { useState } from 'react';
import { Alert, BackLink, Button, Card, ConfirmDialog, Dialog, EmptyState, ErrorState, LoadingBlock, PageHeader, ProblemAlert, SelectField, TextAreaField, TextField } from '../../components/ui.tsx';
import { api, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { formatDateTime } from '../../lib/format.ts';
import { navigate } from '../../lib/router.tsx';
import { useSession } from '../../lib/session.tsx';
import type { ConsultingRequest } from '../../lib/types.ts';
import { Forbidden } from './Forbidden.tsx';

type Decision = 'accept' | 'reject';
const TONE: Record<ConsultingRequest['status'], string> = { pending: 'badge-warning', accepted: 'badge-success', rejected: 'badge-error' };

export function ConsultingAdminPage() {
  const { can } = useSession();
  const list = useLoad(() => api('/api/consulting-requests'), []);
  const [filter, setFilter] = useState<'all' | ConsultingRequest['status']>('pending');
  const [deciding, setDeciding] = useState<{ request: ConsultingRequest; decision: Decision } | null>(null);
  const [removing, setRemoving] = useState<ConsultingRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  if (!can('consulting.manage')) return <Forbidden title="Consulting requests" />;

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    setProblem(null);
    try {
      await api('/api/consulting-requests/:id', { method: 'DELETE', params: { id: removing.id } });
      setRemoving(null);
      list.reload();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };

  /** Create (or reopen) the request's CRM opportunity; converting again links the same records. */
  const openInCrm = async (request: ConsultingRequest) => {
    setBusy(true);
    setProblem(null);
    try {
      const result = await api('/api/consulting-requests/:id/convert', { method: 'POST', params: { id: request.id } });
      navigate(`/crm/opportunities/${result.opportunityId}`);
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };

  const rows = (list.data ?? []).filter((r) => filter === 'all' || r.status === filter);
  return (
    <div className="page">
      <BackLink to="/admin">Admin</BackLink>
      <PageHeader overline="Public site" title="Consulting requests" lede="Requests sent through the public 'Work with us' form." />
      <Alert tone="info" title="Replies are recorded, not emailed yet">
        Email sending arrives with the email queue. Until then, send the reply from the club mailbox; the text you enter here is kept with the request.
      </Alert>
      <div className="cluster">
        <SelectField label="Show" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </SelectField>
      </div>
      {list.problem ? (
        <ErrorState problem={list.problem} onRetry={list.reload} />
      ) : !list.data ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <EmptyState icon="inbox" title="No requests here" />
      ) : (
        <div className="stack">
          {rows.map((r) => (
            <Card
              key={r.id}
              title={r.organization}
              description={`${r.name}${r.roleInOrg ? `, ${r.roleInOrg}` : ''} · ${formatDateTime(r.createdAt)}`}
              actions={<span className={`badge ${TONE[r.status]}`}>{r.status}</span>}
            >
              <div className="stack-sm">
                <p className="cluster">
                  <a className="text-link" href={`mailto:${r.email}`}>
                    {r.email}
                  </a>
                  <span className="muted">{r.phone}</span>
                </p>
                <p className="pre-wrap">{r.requirement}</p>
                {r.response && (
                  <div className="reply">
                    <p className="overline">Reply · {formatDateTime(r.response.sentAt)}</p>
                    <p className="cell-primary">{r.response.emailSubject}</p>
                    <p className="pre-wrap muted">{r.response.emailBody}</p>
                  </div>
                )}
                <div className="cluster">
                  {r.status === 'pending' && (
                    <>
                      <Button size="sm" variant="primary" icon="check" onClick={() => setDeciding({ request: r, decision: 'accept' })}>
                        Accept
                      </Button>
                      <Button size="sm" icon="x" onClick={() => setDeciding({ request: r, decision: 'reject' })}>
                        Reject
                      </Button>
                    </>
                  )}
                  {can('crm.manage') && (
                    <Button size="sm" icon="arrowRightLeft" disabled={busy} onClick={() => void openInCrm(r)}>
                      Open in CRM
                    </Button>
                  )}
                  <Button size="sm" variant="danger-quiet" icon="trash" onClick={() => setRemoving(r)}>
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {deciding && (
        <DecisionDialog
          key={deciding.request.id + deciding.decision}
          {...deciding}
          onClose={(changed) => {
            setDeciding(null);
            if (changed) list.reload();
          }}
        />
      )}
      <ConfirmDialog
        open={removing !== null}
        title="Delete this request?"
        confirmLabel="Delete"
        tone="danger"
        busy={busy}
        problem={problem}
        onConfirm={remove}
        onClose={() => {
          setRemoving(null);
          setProblem(null);
        }}
      >
        <p>The request from {removing?.organization} and any recorded reply are removed for good.</p>
      </ConfirmDialog>
    </div>
  );
}

function DecisionDialog({ request, decision, onClose }: { request: ConsultingRequest; decision: Decision; onClose: (changed: boolean) => void }) {
  const [subject, setSubject] = useState(decision === 'accept' ? 'Your consulting request with 180DC VIT Chennai' : 'Update on your consulting request');
  const [body, setBody] = useState(`Dear ${request.name},\n\n`);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const submit = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await api(decision === 'accept' ? '/api/consulting-requests/:id/accept' : '/api/consulting-requests/:id/reject', {
        method: 'POST',
        params: { id: request.id },
        body: { emailSubject: subject, emailBody: body },
      });
      onClose(true);
    } catch (err) {
      setProblem(problemFrom(err));
      setBusy(false);
    }
  };
  return (
    <Dialog open title={decision === 'accept' ? `Accept ${request.organization}` : `Reject ${request.organization}`} onClose={() => !busy && onClose(false)}>
      <div className="form">
        <TextField label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} error={problem?.fields.emailSubject} maxLength={255} />
        <TextAreaField label="Reply" value={body} onChange={(e) => setBody(e.target.value)} error={problem?.fields.emailBody} rows={8} maxLength={4000} />
        <ProblemAlert problem={problem} fieldsShown={['emailSubject', 'emailBody']} />
        <div className="dialog-actions">
          <Button variant="ghost" onClick={() => onClose(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant={decision === 'accept' ? 'primary' : 'danger'} busy={busy} onClick={submit} disabled={!subject.trim() || !body.trim()}>
            {decision === 'accept' ? 'Accept request' : 'Reject request'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
