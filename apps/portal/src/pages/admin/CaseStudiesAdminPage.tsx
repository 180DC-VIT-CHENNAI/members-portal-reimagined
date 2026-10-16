import { type FormEvent, useState } from 'react';
import { BackLink, Button, Card, ConfirmDialog, EmptyState, ErrorState, LoadingBlock, PageHeader, ProblemAlert, TextAreaField, TextField } from '../../components/ui.tsx';
import { api, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { formatDate } from '../../lib/format.ts';
import { useSession } from '../../lib/session.tsx';
import type { CaseStudy, CaseStudyBody } from '../../lib/types.ts';
import { Forbidden } from './Forbidden.tsx';

export function CaseStudiesAdminPage() {
  const { can } = useSession();
  const list = useLoad(() => api('/api/case-studies'), []);
  const [editing, setEditing] = useState<CaseStudy | 'new' | null>(null);
  const [removing, setRemoving] = useState<CaseStudy | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  if (!can('content.publish')) return <Forbidden title="Case studies" />;

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    setProblem(null);
    try {
      await api('/api/case-studies/:id', { method: 'DELETE', params: { id: removing.id } });
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
      <BackLink to="/admin">Admin</BackLink>
      <PageHeader
        overline="Public site"
        title="Case studies"
        lede="Published straight to the public site. Uploading images and documents comes with file storage; link to a document for now."
        actions={
          editing === null && (
            <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
              New case study
            </Button>
          )
        }
      />
      {editing !== null && (
        <CaseStudyForm
          key={editing === 'new' ? 'new' : editing.id}
          existing={editing === 'new' ? null : editing}
          onDone={(changed) => {
            setEditing(null);
            if (changed) list.reload();
          }}
        />
      )}
      {list.problem ? (
        <ErrorState problem={list.problem} onRetry={list.reload} />
      ) : !list.data ? (
        <LoadingBlock />
      ) : list.data.length === 0 ? (
        <EmptyState icon="bookOpen" title="No case studies yet" />
      ) : (
        <Card flush>
          <div className="table-wrap">
            <table className="table table-stack">
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Tag</th>
                  <th scope="col">Author</th>
                  <th scope="col">Published</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((cs) => (
                  <tr key={cs.id}>
                    <td className="cell-primary">{cs.title}</td>
                    <td data-label="Tag">{cs.tag}</td>
                    <td data-label="Author">{cs.authorName}</td>
                    <td data-label="Published">{formatDate(cs.createdAt)}</td>
                    <td className="cell-actions">
                      <div className="cluster">
                        <Button size="sm" icon="pencil" onClick={() => setEditing(cs)}>
                          Edit
                        </Button>
                        {can('content.manage') && (
                          <Button size="sm" variant="danger-quiet" icon="trash" onClick={() => setRemoving(cs)}>
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
        </Card>
      )}
      <ConfirmDialog
        open={removing !== null}
        title="Delete this case study?"
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
        <p>"{removing?.title}" disappears from the public site straight away.</p>
      </ConfirmDialog>
    </div>
  );
}

function CaseStudyForm({ existing, onDone }: { existing: CaseStudy | null; onDone: (changed: boolean) => void }) {
  const [form, setForm] = useState<CaseStudyBody>({
    tag: existing?.tag ?? '',
    title: existing?.title ?? '',
    description: existing?.description ?? '',
    content: existing?.content ?? '',
    sourceFileUrl: existing?.sourceFileUrl ?? '',
    imageUrl: existing?.imageUrl ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const set = (key: keyof CaseStudyBody) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    const body = { ...form, sourceFileUrl: form.sourceFileUrl || null, imageUrl: form.imageUrl || null };
    try {
      if (existing) await api('/api/case-studies/:id', { method: 'PUT', params: { id: existing.id }, body });
      else await api('/api/case-studies', { method: 'POST', body });
      onDone(true);
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={existing ? 'Edit case study' : 'New case study'}>
      <form className="form" onSubmit={submit}>
        <div className="form-grid">
          <TextField label="Title" value={form.title ?? ''} onChange={set('title')} error={problem?.fields.title} required maxLength={255} />
          <TextField label="Tag" value={form.tag ?? ''} onChange={set('tag')} error={problem?.fields.tag} placeholder="e.g. Strategy" maxLength={255} />
        </div>
        <TextField label="Summary" optional value={form.description ?? ''} onChange={set('description')} error={problem?.fields.description} maxLength={255} />
        <TextAreaField
          label="Story"
          hint="HTML is allowed (paragraphs, headings, lists, links, tables). Scripts and styles are removed."
          value={form.content}
          onChange={set('content')}
          error={problem?.fields.content}
          required
          rows={12}
        />
        <div className="form-grid">
          <TextField label="Source document link" optional value={form.sourceFileUrl ?? ''} onChange={set('sourceFileUrl')} error={problem?.fields.sourceFileUrl} placeholder="https://" />
          <TextField label="Cover image link" optional value={form.imageUrl ?? ''} onChange={set('imageUrl')} error={problem?.fields.imageUrl} placeholder="https://" />
        </div>
        <ProblemAlert problem={problem} fieldsShown={['title', 'tag', 'description', 'content', 'sourceFileUrl', 'imageUrl']} />
        <div className="form-actions">
          <Button variant="ghost" onClick={() => onDone(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={busy}>
            {existing ? 'Save changes' : 'Publish'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
