import { type FormEvent, useState } from 'react';
import { Button, Dialog, ErrorState, LoadingBlock, ProblemAlert, SelectField, TextField } from '../ui.tsx';
import { api, problemFrom, upload, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { formatDate } from '../../lib/format.ts';
import './documents.css';

interface Props {
  readonly fileId: string;
  readonly fileName: string;
  readonly onChanged: () => void;
}

/** Read access permits sharing; mutation controls use fresh server capabilities. */
export function DocumentActions(props: Props) {
  const [panel, setPanel] = useState<'history' | 'share' | null>(null);
  return <>
    <Button size="sm" onClick={() => setPanel('history')}>History</Button>
    <Button size="sm" onClick={() => setPanel('share')}>Share</Button>
    {panel === 'history' && <VersionHistory {...props} onClose={() => setPanel(null)} />}
    {panel === 'share' && <ShareDialog {...props} onClose={() => setPanel(null)} />}
  </>;
}

function VersionHistory({ fileId, fileName, onChanged, onClose }: Props & { readonly onClose: () => void }) {
  const history = useLoad(() => api('/api/documents/:fileId/versions', { params: { fileId } }), [fileId]);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const act = async (operation: () => Promise<unknown>) => {
    setBusy(true); setProblem(null);
    try { await operation(); history.reload(); onChanged(); }
    catch (error) { setProblem(problemFrom(error)); }
    finally { setBusy(false); }
  };
  const data = history.data;
  return <Dialog open title={`Version history: ${fileName}`} onClose={busy ? () => {} : onClose}>
    <div className="document-history stack">
      <p className="muted">Versions are immutable. Restoring keeps the original and creates a new version.</p>
      <ProblemAlert problem={problem} />
      {history.problem ? <ErrorState problem={history.problem} onRetry={history.reload} /> : !data ? <LoadingBlock /> : <>
        <ol className="stack document-versions">
          {data.versions.map((version) => <li key={version.id} className="stack-sm">
            <strong>Version {version.number} - {version.fileName}</strong>
            <p className="caption muted">{formatDate(version.createdAt)} - {version.uploadedByName ?? 'Original uploader'} - {version.bytes} bytes</p>
            {version.restoredFrom && <span className="caption">Restored from a previous version</span>}
            <code className="document-checksum" title="SHA-256 checksum">{version.checksum}</code>
            <div className="cluster">
              <a className="btn btn-secondary btn-sm" href={`/api/documents/${fileId}/versions/${version.id}/download`}>Download v{version.number}</a>
              {data.canManage && version.number !== data.document.revision && !data.document.archived &&
                <Button size="sm" disabled={busy} onClick={() => act(() => api('/api/documents/:fileId/versions/:versionId/restore', {
                  method: 'POST', params: { fileId, versionId: version.id },
                }))}>Restore v{version.number}</Button>}
            </div>
          </li>)}
        </ol>
        {data.canManage && <>
          {!data.document.archived && <form className="form" onSubmit={(e) => {
            e.preventDefault();
            if (!file) return;
            const form = new FormData(); form.append('file', file);
            void act(() => upload(`/api/documents/${fileId}/versions`, form));
          }}>
            <TextField label="New version" type="file" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} hint="Up to 25 MiB; same file policy as the library." />
            <Button type="submit" busy={busy} disabled={!file}>Upload version</Button>
          </form>}
          <RetentionForm key={JSON.stringify(data.document)} fileId={fileId} document={data.document} busy={busy} act={act} />
        </>}
      </>}
      <Button onClick={onClose} disabled={busy}>Close</Button>
    </div>
  </Dialog>;
}

type History = Awaited<ReturnType<typeof api<'/api/documents/:fileId/versions'>>>;
function RetentionForm({ fileId, document, busy, act }: {
  readonly fileId: string; readonly document: History['document']; readonly busy: boolean;
  readonly act: (operation: () => Promise<unknown>) => Promise<void>;
}) {
  const [until, setUntil] = useState(document.retentionUntil ?? '');
  const [hold, setHold] = useState(document.legalHold);
  const [archived, setArchived] = useState(document.archived);
  const [review, setReview] = useState(document.reviewStatus);
  return <form className="form" onSubmit={(e) => {
    e.preventDefault();
    void act(() => api('/api/documents/:fileId/retention', { method: 'PATCH', params: { fileId },
      body: { retentionUntil: until || null, legalHold: hold, archived, reviewStatus: review } }));
  }}>
    <h3>Retention and review</h3>
    <TextField label="Retain until" type="date" optional value={until} onChange={(e) => setUntil(e.target.value)} hint="Metadata only; files are never automatically erased." />
    <label className="cluster"><input type="checkbox" checked={hold} onChange={(e) => setHold(e.target.checked)} />Legal hold - block deletion</label>
    <label className="cluster"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />Archived - pause versions and share links</label>
    <SelectField label="Review status" value={review} onChange={(e) => {
      const value = e.target.value;
      if (value === 'pending' || value === 'approved' || value === 'rejected') setReview(value);
    }}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></SelectField>
    <Button type="submit" busy={busy}>Save metadata</Button>
  </form>;
}

function ShareDialog({ fileId, fileName, onClose }: Props & { readonly onClose: () => void }) {
  const shares = useLoad(() => api('/api/documents/:fileId/shares', { params: { fileId } }), [fileId]);
  const [days, setDays] = useState('7');
  const [limit, setLimit] = useState('');
  const [signIn, setSignIn] = useState(false);
  const [url, setUrl] = useState('');
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (operation: () => Promise<unknown>) => {
    setBusy(true); setProblem(null);
    try { await operation(); shares.reload(); }
    catch (error) { setProblem(problemFrom(error)); }
    finally { setBusy(false); }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void act(async () => {
      const result: { readonly url: string } = await api('/api/documents/:fileId/shares', { method: 'POST', params: { fileId },
        body: { expiresAt: new Date(Date.now() + Number(days) * 86400000).toISOString(),
          maxDownloads: limit ? Number(limit) : null, requireSignIn: signIn } });
      setUrl(new URL(result.url, window.location.origin).href);
    });
  };
  return <Dialog open title={`Share: ${fileName}`} onClose={busy ? () => {} : onClose}>
    <div className="stack">
      <p className="muted">Shares freeze the current version. Anyone holding the link can download unless sign-in is required.</p>
      <form className="form" onSubmit={submit}>
        <div className="form-grid">
          <TextField label="Expires in days" type="number" min={1} max={30} required value={days} onChange={(e) => setDays(e.target.value)} />
          <TextField label="Maximum downloads" type="number" min={1} max={100000} optional value={limit} onChange={(e) => setLimit(e.target.value)} />
        </div>
        <label className="cluster"><input type="checkbox" checked={signIn} onChange={(e) => setSignIn(e.target.checked)} />Require active member sign-in</label>
        <Button type="submit" variant="primary" busy={busy}>Create link</Button>
      </form>
      {url && <TextField label="New share link - copy now" readOnly value={url} onFocus={(e) => e.target.select()} hint="The secret is shown only once." />}
      <ProblemAlert problem={problem} />
      {shares.problem ? <ErrorState problem={shares.problem} onRetry={shares.reload} /> : !shares.data ? <LoadingBlock /> :
        <ul className="stack">{shares.data.shares.map((share) => <li key={share.id} className="row-between">
          <span>Expires {formatDate(share.expiresAt)} - {share.downloads}/{share.maxDownloads ?? 'unlimited'} downloads {share.revokedAt && '(revoked)'}</span>
          {!share.revokedAt && <Button size="sm" disabled={busy} onClick={() => act(() => api('/api/documents/:fileId/shares/:shareId', {
            method: 'DELETE', params: { fileId, shareId: share.id },
          }))}>Revoke</Button>}
        </li>)}</ul>}
      <Button onClick={onClose} disabled={busy}>Close</Button>
    </div>
  </Dialog>;
}
