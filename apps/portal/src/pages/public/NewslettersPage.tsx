import { BackLink, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, useTitle } from '../../components/ui.tsx';
import { api, useLoad } from '../../lib/api.ts';
import { formatDate } from '../../lib/format.ts';
import { cleanHtml } from '../../lib/html.ts';
import { Link } from '../../lib/router.tsx';

export function NewslettersPage() {
  useTitle('The Catalyst');
  const issues = useLoad(() => api('/api/newsletter'), []);
  return <div className="site-section site-narrow stack"><PageHeader overline="The Catalyst" title="Ideas that make a difference" lede="Case studies and stories from our work in social impact." actions={<Link className="btn btn-primary" to="/subscriber">Subscribe by email</Link>} />
    {issues.problem ? <ErrorState problem={issues.problem} onRetry={issues.reload} /> : !issues.data ? <LoadingBlock /> : !issues.data.length ? <EmptyState icon="bookOpen" title="The next issue is on its way">Subscribe to receive it in your inbox.</EmptyState> : issues.data.map((issue) => <Card key={issue.id} title={issue.title} description={issue.description ?? undefined}>
      <div className="row-between"><span className="caption muted">{issue.slug} · {formatDate(issue.sentAt)}</span><Link to={`/newsletter/${issue.slug}`}>Read issue</Link></div>
    </Card>)}
  </div>;
}
export function NewsletterArticlePage({ id }: { readonly id: string }) {
  const issue = useLoad(() => api('/api/newsletter/:id', { params: { id } }), [id]);
  useTitle(issue.data?.title ?? 'The Catalyst');
  if (issue.problem) return <div className="site-section site-narrow"><ErrorState problem={issue.problem} onRetry={issue.reload} /></div>;
  const article = issue.data;
  if (!article) return <LoadingBlock />;
  return <article className="site-section site-narrow stack"><BackLink to="/newsletter">The Catalyst</BackLink><PageHeader overline={`${article.slug} · ${formatDate(article.sentAt)}`} title={article.title} lede={article.description} />
    {article.imageUrl && <img src={article.imageUrl} alt="" className="case-study-cover" />}
    <div className="prose" dangerouslySetInnerHTML={{ __html: cleanHtml(article.content) }} />
    {article.sourceUrl && <a className="text-link" href={article.sourceUrl}>Download source document</a>}<Link className="text-link" to="/subscriber">Get future issues by email</Link>
  </article>;
}
