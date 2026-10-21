import { useState } from 'react';
import { Button, Card, ErrorState, LoadingBlock, PageHeader } from '../components/ui.tsx';
import { api, useLoad } from '../lib/api.ts';
import { formatDate } from '../lib/format.ts';
import { Link } from '../lib/router.tsx';
import '../components/documents/documents.css';

export function KnowledgeArticlePage({ id }: { readonly id: string }) {
  const article = useLoad(() => api('/api/knowledge/:id', { params: { id } }), [id]);
  const [history, setHistory] = useState(false);
  if (article.problem) return <div className="page"><ErrorState problem={article.problem} onRetry={article.reload} /></div>;
  if (!article.data) return <div className="page"><LoadingBlock /></div>;
  const data = article.data;
  return <div className="page page-narrow">
    <Link to="/knowledge">Back to knowledge</Link>
    <PageHeader overline={data.departmentId ?? 'Club-wide'} title={data.title}
      lede={`${data.status} / revision ${data.revision} / ${formatDate(data.updatedAt)}`}
      actions={data.canEdit && <Link className="btn btn-secondary" to={`/knowledge/${id}/edit`}>Edit article</Link>} />
    <p className="muted">{data.tags.join(' / ')}</p>
    <Card><article className="knowledge-body" dangerouslySetInnerHTML={{ __html: data.renderedBody }} /></Card>
    <div className="cluster">
      {data.projectId && <Link to={`/projects/${data.projectId}`}>Linked project</Link>}
      {data.taskId && <span className="caption">Task: {data.taskId}</span>}
      {data.meetId && <Link to="/meets">Linked meeting</Link>}
    </div>
    {data.canEdit && <Button onClick={() => setHistory((value) => !value)} aria-expanded={history}>Revision history</Button>}
    {history && data.canEdit && <ArticleRevisions id={id} />}
  </div>;
}

function ArticleRevisions({ id }: { readonly id: string }) {
  const history = useLoad(() => api('/api/knowledge/:id/revisions', { params: { id } }), [id]);
  return history.problem ? <ErrorState problem={history.problem} onRetry={history.reload} /> : !history.data ? <LoadingBlock /> :
    <Card title="Revision history"><ol className="stack">{history.data.revisions.map((revision) =>
      <li key={revision.id}><details><summary>Revision {revision.number} - {formatDate(revision.createdAt)} - {revision.snapshot.status}</summary>
        <h3>{revision.snapshot.title}</h3><p className="knowledge-body" style={{ whiteSpace: 'pre-wrap' }}>{revision.snapshot.body}</p>
      </details></li>)}</ol></Card>;
}
