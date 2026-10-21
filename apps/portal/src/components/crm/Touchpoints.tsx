import { type FormEvent, useState } from 'react';
import { api } from '../../lib/api.ts';
import { TOUCHPOINT_LABEL, type Touchpoint } from '../../lib/crm-client.ts';
import { formatDateTime } from '../../lib/format.ts';
import { Button, Card, EmptyState, ProblemAlert, SelectField, TextAreaField, TextField } from '../ui.tsx';
import { useRun } from './use-run.ts';

type Kind = keyof typeof TOUCHPOINT_LABEL;
const isKind = (value: string): value is Kind => Object.hasOwn(TOUCHPOINT_LABEL, value);

interface Props {
  touchpoints: readonly Touchpoint[];
  target: { organizationId: string } | { opportunityId: string };
  canLog: boolean;
  onChange: () => void;
}

/** Touchpoint history with a form to log one. Emails keep a subject and a message reference only. */
export function Touchpoints({ touchpoints, target, canLog, onChange }: Props) {
  const [kind, setKind] = useState<Kind>('note');
  const [summary, setSummary] = useState('');
  const [notes, setNotes] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const { busy, problem, run } = useRun();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const body = {
      ...target,
      kind,
      summary,
      notes: kind === 'email' ? null : notes || null,
      externalRef: externalRef || null,
      occurredAt: new Date().toISOString(),
    };
    void run('log', () => api('/api/crm/touchpoints', { method: 'POST', body }), () => {
      setSummary('');
      setNotes('');
      setExternalRef('');
      onChange();
    });
  };
  return (
    <Card title="Touchpoints" description="Meetings, calls, notes and milestones. Emails are linked by reference, never copied here.">
      <div className="stack">
        {canLog && (
          <form className="form" onSubmit={submit}>
            <div className="form-grid">
              <SelectField label="Kind" value={kind} onChange={(e) => isKind(e.target.value) && setKind(e.target.value)}>
                {Object.entries(TOUCHPOINT_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectField>
              <TextField label={kind === 'email' ? 'Subject' : 'Summary'} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={200} />
              {(kind === 'email' || externalRef) && (
                <TextField label="Message reference" hint="The id of the message in the club mailbox." value={externalRef} onChange={(e) => setExternalRef(e.target.value)} maxLength={200} />
              )}
            </div>
            {kind !== 'email' && <TextAreaField label="Notes" optional value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={5000} />}
            <div className="form-actions">
              <Button type="submit" variant="primary" icon="plus" busy={busy === 'log'} disabled={!summary.trim() || (kind === 'email' && !externalRef.trim())}>
                Log touchpoint
              </Button>
            </div>
            <ProblemAlert problem={problem} />
          </form>
        )}
        {touchpoints.length === 0 ? (
          <EmptyState icon="history" title="Nothing logged yet" />
        ) : (
          <ul className="activity-list">
            {touchpoints.map((touchpoint) => (
              <li key={touchpoint.id} className="stack-sm">
                <p className="cluster">
                  <span className="badge">{TOUCHPOINT_LABEL[touchpoint.kind]}</span>
                  <span className="cell-primary">{touchpoint.summary}</span>
                  <span className="caption muted">{formatDateTime(touchpoint.occurredAt)}</span>
                </p>
                {touchpoint.notes && <p className="pre-wrap muted">{touchpoint.notes}</p>}
                {touchpoint.externalRef && <p className="caption muted">Reference: {touchpoint.externalRef}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
