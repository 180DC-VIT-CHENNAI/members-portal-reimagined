import { type FormEvent, useState } from 'react';
import { useRun } from '../../components/crm/use-run.ts';
import { Button, Card, ProblemAlert, SelectField, TextField } from '../../components/ui.tsx';
import { api, useLoad } from '../../lib/api.ts';
import type { Stage } from '../../lib/crm-client.ts';
import { Link } from '../../lib/router.tsx';

export function CrmAdminTools({ stages, onChange }: { stages: Stage[]; onChange: () => void }) {
  const duplicates = useLoad(() => api('/api/crm/duplicates'), []);
  const [stageId, setStageId] = useState('');
  const [label, setLabel] = useState('');
  const [sortOrder, setSortOrder] = useState(50);
  const [targetId, setTargetId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [kind, setKind] = useState<'organization' | 'contact'>('organization');
  const { busy, problem, run } = useRun();
  const addStage = (e: FormEvent) => {
    e.preventDefault();
    void run('stage', () => api('/api/crm/stages', { method: 'POST', body: { id: stageId, label, sortOrder } }), () => {
      setStageId('');
      setLabel('');
      onChange();
    });
  };
  const groups = kind === 'organization' ? duplicates.data?.organizations : duplicates.data?.contacts;
  return <details className="card"><summary className="card-inner">CRM administration</summary><div className="card-inner stack">
    <Card title="Pipeline stages">
      <ul className="activity-list">{stages.map((stage) => <li key={stage.id} className="cluster">
        <span>{stage.label}</span><span className="caption muted">{stage.active ? 'Active' : 'Retired'}</span>
        {stage.kind === 'open' && <Button size="sm" busy={busy === stage.id} onClick={() => void run(stage.id, () => api('/api/crm/stages/:id', {
          method: 'PATCH', params: { id: stage.id }, body: { active: !stage.active },
        }), onChange)}>{stage.active ? 'Retire' : 'Restore'}</Button>}
      </li>)}</ul>
      <form className="form" onSubmit={addStage}><div className="form-grid">
        <TextField label="Stage id" hint="Lowercase letters and underscores." value={stageId} onChange={(e) => setStageId(e.target.value)} required pattern="[a-z][a-z0-9_]{1,30}" />
        <TextField label="Label" value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={60} />
        <TextField label="Order" type="number" min={0} max={899} value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
      </div><Button type="submit" busy={busy === 'stage'} disabled={!stageId || !label}>Add stage</Button></form>
    </Card>
    <Card title="Review and merge duplicates" description="Children and explicit grants move to the surviving record. Review both records before merging; this cannot be undone.">
      <SelectField label="Records" value={kind} onChange={(e) => { setKind(e.target.value === 'contact' ? 'contact' : 'organization'); setSourceId(''); setTargetId(''); }}>
        <option value="organization">Organisations</option><option value="contact">Contacts</option>
      </SelectField>
      {duplicates.problem && <ProblemAlert problem={duplicates.problem} />}
      {groups?.length === 0 && <p className="muted">No matching {kind === 'organization' ? 'website domains' : 'email addresses'}.</p>}
      {groups?.map((group) => <div key={group.key} className="stack-sm">
        <h3>{group.key}</h3><ul>{group.records.map((record) => <li key={record.id}>
          {'name' in record ? <Link to={`/crm/organizations/${record.id}`}>{record.name}</Link> : record.fullName}
          <div className="caption muted">{record.id}</div>
        </li>)}</ul>
      </div>)}
      <form className="form" onSubmit={(e) => {
        e.preventDefault();
        void run('merge', () => api(kind === 'organization' ? '/api/crm/organizations/:id/merge' : '/api/crm/contacts/:id/merge', {
          method: 'POST', params: { id: targetId }, body: { sourceId },
        }), () => { setTargetId(''); setSourceId(''); duplicates.reload(); onChange(); });
      }}>
        <TextField label="Surviving record id" value={targetId} onChange={(e) => setTargetId(e.target.value)} required />
        <TextField label="Duplicate record id" value={sourceId} onChange={(e) => setSourceId(e.target.value)} required />
        <label className="check"><input type="checkbox" required />I reviewed both records and want to merge the duplicate into the survivor.</label>
        <Button type="submit" variant="danger" busy={busy === 'merge'} disabled={!targetId || !sourceId || targetId === sourceId}>Merge records</Button>
      </form>
    </Card><ProblemAlert problem={problem} />
  </div></details>;
}
