import { useState } from 'react';
import { Card, EmptyState, ErrorState, LoadingBlock, PageHeader, SearchField } from '../components/ui.tsx';
import { api, useLoad } from '../lib/api.ts';
import { formatDate } from '../lib/format.ts';
import { Link } from '../lib/router.tsx';
import { useSession } from '../lib/session.tsx';
import { Forbidden } from './admin/Forbidden.tsx';

export function KnowledgePage() {
  const { can } = useSession();
  const [search, setSearch] = useState('');
  const [before, setBefore] = useState<string | undefined>();
  const list = useLoad(() => api('/api/knowledge', { query: { search, ...(before ? { before } : {}) } }), [search, before]);
  if (!can('knowledge.view')) return <Forbidden title="Knowledge" />;
  return <div className="page page-narrow">
    <PageHeader overline="Club knowledge" title="Knowledge base" lede="Methods, handover guides and the practices we build together."
      actions={can('knowledge.edit') && <Link className="btn btn-primary" to="/knowledge/new">Write an article</Link>} />
    <SearchField label="Search knowledge" placeholder="Search titles and article text" value={search} onChange={(e) => {
      setBefore(undefined); setSearch(e.target.value);
    }} />
    {list.problem ? <ErrorState problem={list.problem} onRetry={list.reload} /> : !list.data ? <LoadingBlock /> :
      list.data.articles.length === 0 ? <EmptyState icon="bookOpen" title="No articles found" /> :
      <div className="stack">{list.data.articles.map((article) =>
        <Card key={article.id} title={<Link to={`/knowledge/${article.id}`}>{article.title}</Link>}>
          <div className="cluster"><span className="badge">{article.status}</span>
            <span className="caption muted">{article.departmentId ?? 'Club-wide'} - Updated {formatDate(article.updatedAt)}</span></div>
          {article.tags.length > 0 && <p className="muted">{article.tags.join(' / ')}</p>}
        </Card>)}</div>}
    <div className="cluster">
      {before && <button className="btn btn-secondary" onClick={() => setBefore(undefined)}>Newest articles</button>}
      {list.data?.nextBefore && <button className="btn btn-secondary" onClick={() => setBefore(list.data?.nextBefore ?? undefined)}>Older articles</button>}
    </div>
  </div>;
}
