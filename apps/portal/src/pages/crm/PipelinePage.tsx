import { type FormEvent, useState } from 'react';
import { Alert, Button, Card, Dialog, EmptyState, ErrorState, LoadingBlock, PageHeader, ProblemAlert, SearchField, TextField } from '../../components/ui.tsx';
import { api, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { LOST_REASONS, loadNextSteps, loadOpportunities, loadSummary, type OpportunityRow, type Stage } from '../../lib/crm-client.ts';
import { formatDate } from '../../lib/format.ts';
import { Link, navigate } from '../../lib/router.tsx';
import { CrmAdminTools } from './CrmAdminTools.tsx';
import './crm.css';

/** The pipeline: opportunities the caller can see, as stage columns or a list, plus their own due next steps. */
export function PipelinePage() {
  const summary = useLoad(loadSummary, []);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'board' | 'list'>('board');
  const opportunities = useLoad(() => loadOpportunities(query.trim()), [query]);
  const steps = useLoad(loadNextSteps, []);
  const [creating, setCreating] = useState(false);

  if (summary.problem) return <ErrorState problem={summary.problem} onRetry={summary.reload} />;
  if (!summary.data) return <LoadingBlock />;
  const stages = summary.data.stages.filter((stage) => stage.active || summary.data?.counts[stage.id]);
  const rows = opportunities.data ?? [];

  return (
    <div className="page">
      <PageHeader
        overline="Business development"
        title="CRM pipeline"
        lede="Client organisations and opportunities you own or were given access to."
        actions={
          <>
            <Button icon="briefcase" onClick={() => navigate('/crm/organizations')}>
              Organisations
            </Button>
            {summary.data.canManage && (
              <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
                New organisation
              </Button>
            )}
          </>
        }
      />
      <div className="stack">
        {steps.data && steps.data.length > 0 && (
          <Card title="My next steps" description="Your open opportunities with a next step due today or earlier.">
            <ul className="activity-list">
              {steps.data.map((step) => (
                <li key={step.id} className="cluster">
                  <Link to={`/crm/opportunities/${step.id}`} className="cell-primary">
                    {step.title}
                  </Link>
                  <span className="muted">{step.nextAction ?? 'Next step'}</span>
                  <span className={step.overdue ? 'badge badge-error' : 'badge badge-warning'}>{step.overdue ? `Overdue since ${formatDate(step.nextActionDue)}` : 'Due today'}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
          <SearchField label="Search" placeholder="Opportunity or organisation" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="cluster" role="group" aria-label="View">
            <Button size="sm" variant={view === 'board' ? 'primary' : 'secondary'} onClick={() => setView('board')} aria-pressed={view === 'board'}>
              Board
            </Button>
            <Button size="sm" variant={view === 'list' ? 'primary' : 'secondary'} onClick={() => setView('list')} aria-pressed={view === 'list'}>
              List
            </Button>
          </div>
        </form>
        {opportunities.problem ? (
          <ErrorState problem={opportunities.problem} onRetry={opportunities.reload} />
        ) : !opportunities.data ? (
          <LoadingBlock />
        ) : rows.length === 0 ? (
          <EmptyState icon="briefcase" title={query ? 'No opportunities match' : 'No opportunities yet'}>
            Opportunities you own, or that someone shares with you, appear here.
          </EmptyState>
        ) : view === 'board' ? (
          <Board stages={stages} rows={rows} counts={summary.data.counts} />
        ) : (
          <List stages={summary.data.stages} rows={rows} />
        )}
        {summary.data.isAdmin && <CrmAdminTools stages={summary.data.stages} onChange={summary.reload} />}
      </div>
      {creating && <NewOrganizationDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function Board({ stages, rows, counts }: { stages: Stage[]; rows: OpportunityRow[]; counts: Record<string, number> }) {
  return (
    <div className="crm-board" role="list" aria-label="Pipeline stages">
      {stages.map((stage) => {
        const inStage = rows.filter((row) => row.stageId === stage.id);
        return (
          <section key={stage.id} className="crm-column" role="listitem" aria-label={stage.label}>
            <h2 className="crm-column-head">
              {stage.label} <span className="badge">{counts[stage.id] ?? 0}</span>
            </h2>
            {inStage.map((row) => (
              <Link key={row.id} to={`/crm/opportunities/${row.id}`} className="crm-card">
                <span className="cell-primary">{row.title}</span>
                <span className="caption muted">{row.organizationName}</span>
                {row.nextActionDue && <span className="caption">Next: {formatDate(row.nextActionDue)}</span>}
                {row.lostReason && <span className="caption muted">{LOST_REASONS[row.lostReason]}</span>}
              </Link>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function List({ stages, rows }: { stages: Stage[]; rows: OpportunityRow[] }) {
  const label = (id: string) => stages.find((stage) => stage.id === id)?.label ?? id;
  return (
    <Card flush>
      <div className="table-wrap">
        <table className="table table-stack">
          <thead>
            <tr>
              <th scope="col">Opportunity</th>
              <th scope="col">Stage</th>
              <th scope="col">Owner</th>
              <th scope="col">Next step</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="cell-primary">
                  <Link to={`/crm/opportunities/${row.id}`}>{row.title}</Link>
                  <div className="caption muted">{row.organizationName}</div>
                </td>
                <td data-label="Stage">{label(row.stageId)}</td>
                <td data-label="Owner">{row.ownerName ?? '—'}</td>
                <td data-label="Next step">{row.nextAction ? `${row.nextAction}${row.nextActionDue ? ` (${formatDate(row.nextActionDue)})` : ''}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** The id in a 409 duplicate_organization answer, if that is what the error is. */
function duplicateOf(err: unknown): string | null {
  if (typeof err !== 'object' || err === null || !('status' in err) || err.status !== 409 || !('data' in err)) return null;
  const { data } = err;
  return typeof data === 'object' && data !== null && 'id' in data && typeof data.id === 'string' ? data.id : null;
}

function NewOrganizationDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    setDuplicateId(null);
    try {
      const { id } = await api('/api/crm/organizations', { method: 'POST', body: { name, website: website || null } });
      navigate(`/crm/organizations/${id}`);
    } catch (err) {
      const existing = duplicateOf(err);
      if (existing) setDuplicateId(existing);
      else setProblem(problemFrom(err));
      setBusy(false);
    }
  };
  return (
    <Dialog open title="New organisation" onClose={() => !busy && onClose()}>
      <form className="form" onSubmit={submit}>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required error={problem?.fields.name} />
        <TextField label="Website" optional hint="Used to spot duplicates." value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={300} error={problem?.fields.website} />
        {duplicateId && (
          <Alert tone="warning" title="You already have an organisation with this website">
            <Link to={`/crm/organizations/${duplicateId}`} className="text-link">
              Open the existing record
            </Link>
          </Alert>
        )}
        <ProblemAlert problem={problem} fieldsShown={['name', 'website']} />
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={busy} disabled={!name.trim()}>
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
