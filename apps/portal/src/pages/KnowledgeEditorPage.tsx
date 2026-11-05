import { type FormEvent, useState } from 'react';
import { Button, Card, ErrorState, LoadingBlock, PageHeader, ProblemAlert, SelectField, TextAreaField, TextField } from '../components/ui.tsx';
import { api, lookups, problemFrom, useLoad } from '../lib/api.ts';
import type { ApiProblem } from '../lib/errors.ts';
import { Link, navigate } from '../lib/router.tsx';
import { useSession } from '../lib/session.tsx';
import { Forbidden } from './admin/Forbidden.tsx';

const loadArticle = (id: string) => api('/api/knowledge/:id', { params: { id } });
type Article = Awaited<ReturnType<typeof loadArticle>>;

export function KnowledgeEditorPage({ id }: { readonly id?: string }) {
  const { can } = useSession();
  const loaded = useLoad(() => id ? loadArticle(id) : Promise.resolve(null), [id]);
  if (!can('knowledge.edit')) return <Forbidden title="Write knowledge" />;
  if (loaded.problem) return <div className="page"><ErrorState problem={loaded.problem} onRetry={loaded.reload} /></div>;
  if (loaded.data === undefined) return <div className="page"><LoadingBlock /></div>;
  if (loaded.data && !loaded.data.canEdit) return <Forbidden title="Edit knowledge" />;
  return <KnowledgeForm key={id ?? 'new'} article={loaded.data} />;
}

function KnowledgeForm({ article }: { readonly article: Article | null }) {
  const { can, me } = useSession();
  const departments = useLoad(lookups.departments, []);
  const [title, setTitle] = useState(article?.title ?? '');
  const [slug, setSlug] = useState(article?.slug ?? '');
  const [body, setBody] = useState(article?.body ?? '');
  const [departmentId, setDepartmentId] = useState(article?.departmentId ?? (can('knowledge.edit', null) ? '' : me.departmentId ?? ''));
  const [status, setStatus] = useState<'draft' | 'published' | 'archived'>(article?.status ?? 'draft');
  const [tags, setTags] = useState(article?.tags.join(', ') ?? '');
  const [projectId, setProjectId] = useState(article?.projectId ?? '');
  const [taskId, setTaskId] = useState(article?.taskId ?? '');
  const [meetId, setMeetId] = useState(article?.meetId ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const publish = can('knowledge.publish', departmentId || null);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setProblem(null);
    const input = { title, slug, body, scope: departmentId ? 'department' as const : 'global' as const, departmentId: departmentId || null,
      status: publish ? status : 'draft' as const, tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      projectId: projectId || null, taskId: taskId || null, meetId: meetId || null, ...(article ? { revision: article.revision } : {}) };
    try {
      const saved = article
        ? await api('/api/knowledge/:id', { method: 'PUT', params: { id: article.id }, body: input })
        : await api('/api/knowledge', { method: 'POST', body: input });
      navigate(`/knowledge/${saved.id}`);
    } catch (error) { setProblem(problemFrom(error)); }
    finally { setBusy(false); }
  };
  return <div className="page page-narrow">
    <Link to={article ? `/knowledge/${article.id}` : '/knowledge'}>Back</Link>
    <PageHeader overline="Knowledge" title={article ? 'Edit article' : 'Write an article'} lede="Keep working knowledge clear, searchable and in the right scope." />
    <Card><form className="form" onSubmit={submit}>
      <TextField label="Title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      <TextField label="Slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={160} value={slug} onChange={(e) => setSlug(e.target.value)} hint="Lowercase words separated by hyphens. Unique across the knowledge base." />
      <SelectField label="Audience" value={departmentId} disabled={Boolean(article)} onChange={(e) => setDepartmentId(e.target.value)}>
        {can('knowledge.edit', null) && <option value="">Club-wide</option>}
        {departments.data?.filter((department) => can('knowledge.edit', department.id) &&
          (me.departmentId === department.id || can('departments.workspace.view', department.id))).map((department) =>
          <option key={department.id} value={department.id}>{department.name}</option>)}
      </SelectField>
      <TextAreaField label="Article body" required rows={16} maxLength={100000} value={body} onChange={(e) => setBody(e.target.value)}
        hint="Plain text with # headings, **bold** and `code`. Raw HTML and active links are not supported." />
      <TextField label="Tags" optional value={tags} onChange={(e) => setTags(e.target.value)} hint="Comma separated; up to 20 tags." />
      <div className="form-grid">
        <TextField label="Project ID" optional value={projectId} onChange={(e) => setProjectId(e.target.value)} />
        <TextField label="Task ID" optional value={taskId} onChange={(e) => setTaskId(e.target.value)} />
        <TextField label="Meeting ID" optional value={meetId} onChange={(e) => setMeetId(e.target.value)} />
      </div>
      {publish && <SelectField label="Status" value={status} onChange={(e) => {
        const value = e.target.value;
        if (value === 'draft' || value === 'published' || value === 'archived') setStatus(value);
      }}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></SelectField>}
      {!publish && <p className="caption muted">Saved as a draft. A publisher must approve publication.</p>}
      <ProblemAlert problem={problem} />
      <Button type="submit" variant="primary" busy={busy}>Save article</Button>
    </form></Card>
  </div>;
}
