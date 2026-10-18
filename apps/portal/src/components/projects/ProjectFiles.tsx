import { type FormEvent, useState } from 'react';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, LoadingBlock, ProblemAlert, SelectField, TextField } from '../ui.tsx';
import { Icon } from '../icons.tsx';
import { api, problemFrom, upload, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { formatDate } from '../../lib/format.ts';
import type { Project } from '../../lib/project-client.ts';
import { CLUB_FILE_TYPES } from '../../server/club-files.ts';

const ACCEPT = Object.keys(CLUB_FILE_TYPES).map((ext) => `.${ext}`).join(',');

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const loadFiles = (projectId: string, taskId: string) =>
  taskId
    ? api('/api/projects/:id/tasks/:taskId/files', { params: { id: projectId, taskId } })
    : api('/api/projects/:id/files', { params: { id: projectId } });
type ProjectFile = Awaited<ReturnType<typeof loadFiles>>['files'][number];

const filesPath = (projectId: string, taskId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}${taskId ? `/tasks/${encodeURIComponent(taskId)}` : ''}/files`;

/**
 * Private attachments on the project or one of its tasks. Everyone who can see
 * the project can download them; people who manage its tasks add and remove them.
 */
export function ProjectFiles({ project }: { readonly project: Project }) {
  const [taskId, setTaskId] = useState('');
  const scope = taskId && project.tasks.some((t) => t.id === taskId) ? taskId : '';
  const list = useLoad(() => loadFiles(project.id, scope), [project.id, scope]);
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [removing, setRemoving] = useState<ProjectFile | null>(null);

  const failed = (err: unknown) => {
    const next = problemFrom(err);
    setProblem(next);
    if (next.status === 403 || next.status === 404) list.reload();
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setProblem(null);
    const form = new FormData();
    form.append('file', file);
    try {
      await upload(filesPath(project.id, scope), form);
      setFile(null);
      setInputKey((k) => k + 1);
      list.reload();
    } catch (err) {
      failed(err);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    setProblem(null);
    try {
      if (scope) {
        await api('/api/projects/:id/tasks/:taskId/files/:fileId', { method: 'DELETE', params: { id: project.id, taskId: scope, fileId: removing.id } });
      } else {
        await api('/api/projects/:id/files/:fileId', { method: 'DELETE', params: { id: project.id, fileId: removing.id } });
      }
      setRemoving(null);
      list.reload();
    } catch (err) {
      failed(err);
    } finally {
      setBusy(false);
    }
  };

  const data = list.loading ? undefined : list.data;
  return (
    <Card title="Files" description="Private to people who can see this project. Up to 25 MB each.">
      <div className="stack">
        {project.tasks.length > 0 && (
          <SelectField label="Attached to" value={scope} disabled={busy} onChange={(e) => {
            setProblem(null);
            setFile(null);
            setInputKey((key) => key + 1);
            setTaskId(e.target.value);
          }}>
            <option value="">The whole project</option>
            {project.tasks.map((t) => (
              <option key={t.id} value={t.id}>
                Task: {t.title}
              </option>
            ))}
          </SelectField>
        )}
        {data?.canUpload && (
          <form className="form" onSubmit={submit}>
            <TextField key={inputKey} label="File" type="file" accept={ACCEPT} required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <div className="form-actions">
              <Button type="submit" variant="primary" size="sm" icon="upload" busy={busy} disabled={!file}>
                Upload
              </Button>
            </div>
          </form>
        )}
        <ProblemAlert problem={removing ? null : problem} />
        {list.problem ? (
          <ErrorState problem={list.problem} onRetry={list.reload} />
        ) : !data ? (
          <LoadingBlock rows={2} />
        ) : data.files.length === 0 ? (
          <EmptyState icon="search" title="No files yet" />
        ) : (
          <ul className="stack">
            {data.files.map((f) => (
              <li key={f.id} className="row-between">
                <div className="stack-sm">
                  <strong>{f.fileName}</strong>
                  <p className="caption muted">
                    {formatSize(f.bytes)} · {f.uploadedByName ?? 'Former member'} · {formatDate(f.createdAt)}
                  </p>
                </div>
                <div className="cluster">
                  <a className="btn btn-secondary btn-sm" href={`${filesPath(project.id, scope)}/${encodeURIComponent(f.id)}/download`} download>
                    <Icon name="download" size={16} />
                    Download
                  </a>
                  {data.canDelete && (
                    <Button size="sm" variant="danger-quiet" icon="trash" disabled={busy} onClick={() => { setProblem(null); setRemoving(f); }}>
                      Remove
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {data && data.files.length >= data.limit && <p className="caption muted">This holds the most files allowed ({data.limit}). Remove one to add another.</p>}
      </div>
      <ConfirmDialog
        open={removing !== null}
        title={removing ? `Remove "${removing.fileName}"?` : ''}
        confirmLabel="Remove file"
        tone="danger"
        busy={busy}
        problem={removing ? problem : null}
        onConfirm={remove}
        onClose={() => { setRemoving(null); setProblem(null); }}
      >
        <p>It is deleted for everyone on the project.</p>
      </ConfirmDialog>
    </Card>
  );
}
