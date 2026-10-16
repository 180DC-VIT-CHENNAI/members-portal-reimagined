import { type DragEvent, useState } from 'react';
import { Icon } from '../../components/icons.tsx';
import { Alert, BackLink, Button, Card, PageHeader, ProblemAlert, TextAreaField, cx } from '../../components/ui.tsx';
import { api, problemFrom } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { describeCode } from '../../lib/errors.ts';
import { plural } from '../../lib/format.ts';
import type { ImportResponse } from '../../lib/types.ts';
import { useSession } from '../../lib/session.tsx';
import { Forbidden } from './Forbidden.tsx';

const TEMPLATE = 'email,full_name,department,position,access_role\nname@vitstudent.ac.in,Full Name,tech,Member,member\n';

export function ImportPage() {
  const { can } = useSession();
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [done, setDone] = useState<ImportResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  if (!can('people.import')) return <Forbidden title="Import" />;

  const run = async (dryRun: boolean) => {
    setBusy(true);
    setProblem(null);
    try {
      const result = await api('/api/imports/people', { method: 'POST', body: { csv, dryRun } });
      if (dryRun) setPreview(result);
      else {
        setDone(result);
        setPreview(null);
        setCsv('');
      }
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setCsv(await file.text());
    setPreview(null);
    setDone(null);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void readFile(e.dataTransfer.files[0]);
  };

  const shown = preview ?? done;
  return (
    <div className="page">
      <BackLink to="/admin">Admin</BackLink>
      <PageHeader
        overline="People"
        title="Bulk import"
        lede="Invite many people at once from a CSV. Check the preview first; nothing is saved until you confirm."
        actions={
          <a className="btn btn-secondary" href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="people-template.csv">
            <Icon name="download" size={18} />
            Template
          </a>
        }
      />
      <div className="stack">
        <Card title="1. Add the CSV" description="Columns: email, full_name, department (ID), position (title), access_role (ID). Up to 500 rows.">
          <div className="stack">
            <label className={cx('drop-zone', over && 'is-over')} onDragOver={(e) => (e.preventDefault(), setOver(true))} onDragLeave={() => setOver(false)} onDrop={onDrop}>
              <Icon name="upload" size={22} />
              <span>Drop a .csv file here, or choose one</span>
              <input type="file" accept=".csv,text/csv" className="visually-hidden" onChange={(e) => void readFile(e.target.files?.[0])} />
            </label>
            <TextAreaField
              label="Or paste it"
              rows={8}
              className="field-mono"
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setPreview(null);
              }}
              spellCheck={false}
            />
            <ProblemAlert problem={problem} />
            <div className="form-actions">
              <Button variant="primary" busy={busy && !preview} disabled={!csv.trim()} onClick={() => run(true)}>
                Preview
              </Button>
            </div>
          </div>
        </Card>
        {done && (
          <Alert tone="success" title={`${plural(done.invited, 'person', 'people')} invited.`}>
            {done.skipped > 0 && `${plural(done.skipped, 'row')} skipped because they're already in the portal. `}
            {done.errors > 0 && `${plural(done.errors, 'row')} had errors and weren't imported.`}
          </Alert>
        )}
        {shown && (
          <Card
            title={preview ? '2. Check and confirm' : 'Result'}
            description={`${plural(shown.invited, 'invite')}, ${shown.skipped} skipped, ${plural(shown.errors, 'error')}.`}
            flush
            actions={
              preview && (
                <Button variant="primary" busy={busy} disabled={preview.invited === 0} onClick={() => run(false)}>
                  Invite {plural(preview.invited, 'person', 'people')}
                </Button>
              )
            }
          >
            <div className="table-wrap">
              <table className="table table-stack">
                <thead>
                  <tr>
                    <th scope="col" className="num">
                      Row
                    </th>
                    <th scope="col">Email</th>
                    <th scope="col">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.results.map((r) => (
                    <tr key={r.row}>
                      <td className="num" data-label="Row">
                        {r.row}
                      </td>
                      <td className="cell-primary wrap-anywhere">{r.email || <span className="muted">(none)</span>}</td>
                      <td data-label="Result">
                        <span className={cx('badge', r.result === 'invited' ? 'badge-success' : r.result === 'error' ? 'badge-error' : '')}>
                          {r.result === 'invited' ? (preview ? 'Will invite' : 'Invited') : r.result === 'skipped' ? 'Skipped' : 'Error'}
                        </span>
                        {r.reason && <span className="caption muted"> {describeCode(r.reason)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
