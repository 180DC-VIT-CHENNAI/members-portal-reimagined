import { type FormEvent, useState } from 'react';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, LoadingBlock, PageHeader, ProblemAlert, SearchField, SelectField, TextField } from '../components/ui.tsx';
import { Icon } from '../components/icons.tsx';
import { api, problemFrom, upload, useLoad } from '../lib/api.ts';
import type { ApiProblem } from '../lib/errors.ts';
import { formatDate } from '../lib/format.ts';
import { setQuery, useLocation } from '../lib/router.tsx';
import { useSession } from '../lib/session.tsx';
import { Forbidden } from './admin/Forbidden.tsx';
import { DocumentActions } from '../components/documents/DocumentActions.tsx';

const CATEGORIES = [
  { id: 'general', label: 'General' },
  { id: 'projects', label: 'Projects' },
  { id: 'events', label: 'Events' },
] as const;
type Category = (typeof CATEGORIES)[number]['id'];

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.md,.png,.jpg,.jpeg,.webp,.gif,.zip';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Shared club file library: everyone with files.view browses and downloads; files.manage uploads and deletes. */
export function FilesPage() {
  const { can } = useSession();
  const { query } = useLocation();
  const category = query.get('category') ?? '';
  const search = query.get('search') ?? '';
  const list = useLoad(() => api('/api/club-files', { query: { category, search } as never }), [category, search]);
  const [removing, setRemoving] = useState<{ id: string; fileName: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  if (!can('files.view')) return <Forbidden title="Files" />;
  const manage = can('files.manage');

  const setFilter = (key: string, value: string) => setQuery({ [key]: value || null });

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    setProblem(null);
    try {
      await api('/api/club-files/:id', { method: 'DELETE', params: { id: removing.id } });
      setRemoving(null);
      list.reload();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader overline="Club" title="Files" lede="Shared documents, decks and photos for the whole club." />
      {manage && <UploadFile onUploaded={list.reload} />}
      <div className="card">
        <div className="card-inner flush">
          <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
            <SearchField
              className="field-search"
              label="Search"
              placeholder="File name or description"
              defaultValue={search}
              onChange={(e) => setFilter('search', e.target.value.trim())}
            />
            <SelectField label="Category" value={category} onChange={(e) => setFilter('category', e.target.value)}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </SelectField>
          </form>
          {list.problem ? (
            <ErrorState problem={list.problem} onRetry={list.reload} />
          ) : !list.data ? (
            <LoadingBlock />
          ) : list.data.files.length === 0 ? (
            <EmptyState icon="fileText" title={search || category ? 'No files match' : 'No files yet'} />
          ) : (
            <div className="table-wrap">
              <table className="table table-stack">
                <thead>
                  <tr>
                    <th scope="col">File</th>
                    <th scope="col">Category</th>
                    <th scope="col">Uploaded by</th>
                    <th scope="col">Date</th>
                    <th scope="col">Size</th>
                    <th scope="col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.files.map((f) => (
                    <tr key={f.id}>
                      <td className="cell-primary">
                        <span className="person-cell-text">
                          <span>{f.fileName}</span>
                          {(f.eventName || f.projectName || f.description) && (
                            <span className="caption muted">{[f.eventName ?? f.projectName, f.description].filter(Boolean).join(' · ')}</span>
                          )}
                        </span>
                      </td>
                      <td data-label="Category">{CATEGORIES.find((c) => c.id === f.category)?.label ?? f.category}</td>
                      <td data-label="Uploaded by">{f.uploadedByName || f.uploadedBy}</td>
                      <td data-label="Date">{formatDate(f.createdAt)}</td>
                      <td data-label="Size">{formatSize(f.fileSize)}</td>
                      <td className="cell-actions">
                        <div className="cluster">
                          <DocumentActions fileId={f.id} fileName={f.fileName} onChanged={list.reload} />
                          <a className="btn btn-secondary btn-sm" href={`/api/club-files/${encodeURIComponent(f.id)}/download`} download>
                            <Icon name="download" size={16} />
                            Download
                          </a>
                          {manage && (
                            <Button size="sm" variant="danger-quiet" icon="trash" onClick={() => setRemoving(f)}>
                              Delete
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={removing !== null}
        title="Delete this file?"
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
        <p>"{removing?.fileName}" is removed for everyone.</p>
      </ConfirmDialog>
    </div>
  );
}

function UploadFile({ onUploaded }: { onUploaded: () => void }) {
  const [inputKey, setInputKey] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<Category>('general');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setProblem(null);
    const form = new FormData();
    form.append('file', file);
    form.append('category', category);
    if (category === 'events' && label.trim()) form.append('eventName', label.trim());
    if (category === 'projects' && label.trim()) form.append('projectName', label.trim());
    if (description.trim()) form.append('description', description.trim());
    try {
      await upload('/api/club-files/upload', form);
      setFile(null);
      setLabel('');
      setDescription('');
      setInputKey((k) => k + 1);
      onUploaded();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Upload a file" description="Up to 25 MB. Documents, spreadsheets, slides, images, text and zip files.">
      <form className="form" onSubmit={submit}>
        <div className="form-grid">
          <TextField key={inputKey} label="File" type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
          <SelectField label="Category" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </SelectField>
          {category !== 'general' && (
            <TextField label={category === 'events' ? 'Event' : 'Project'} optional value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
          )}
        </div>
        <TextField label="Description" optional value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        <ProblemAlert problem={problem} />
        <div className="form-actions">
          <Button type="submit" variant="primary" icon="upload" busy={busy} disabled={!file}>
            Upload
          </Button>
        </div>
      </form>
    </Card>
  );
}
