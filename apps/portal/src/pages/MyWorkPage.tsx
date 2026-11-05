import { ItemRow } from '../components/github/ItemRow.tsx';
import { Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader } from '../components/ui.tsx';
import { useLoad } from '../lib/api.ts';
import { github } from '../lib/github-client.ts';
import { myWorkSections } from '../lib/github-view.ts';
import { Link } from '../lib/router.tsx';
import { useSession } from '../lib/session.tsx';

const countText = (count: number) => `${count} ${count === 1 ? 'item' : 'items'}`;

/** What needs the signed-in person across every mapped GitHub repository. */
export function MyWorkPage() {
  const { me } = useSession();
  const work = useLoad(() => github.myWork(), []);
  const data = work.data;

  const sections = data?.linked ? myWorkSections(data).filter((section) => section.key !== 'overdue' || section.items.length > 0) : [];
  const allClear = data?.linked === true && sections.every((section) => section.items.length === 0);

  return (
    <div className="page">
      <PageHeader
        overline="GitHub"
        title="My work"
        lede={data?.linked && data.login ? `Issues and pull requests that need you, as @${data.login}.` : 'Issues assigned to you and pull requests waiting on your review.'}
        actions={
          <Button icon="history" onClick={work.reload} busy={work.loading}>
            Refresh
          </Button>
        }
      />
      <div className="stack">
        {!data ? (
          <Card flush>{work.problem ? <ErrorState problem={work.problem} onRetry={work.reload} /> : <LoadingBlock rows={4} label="Loading your work" />}</Card>
        ) : !data.linked ? (
          <Card title="Link your GitHub account" description="My work is built from the GitHub account linked to your profile.">
            <div className="stack-sm">
              <p>Link it once and the issues assigned to you and the pull requests waiting on you will appear here.</p>
              <div>
                <Link to={`/people/${me.id}`} className="btn btn-primary">
                  Open my profile
                </Link>
              </div>
            </div>
          </Card>
        ) : allClear ? (
          <Card>
            <EmptyState icon="checkCircle" title="You're all caught up">
              Nothing is assigned to you, no review is waiting on you and you have no open pull requests.
            </EmptyState>
          </Card>
        ) : (
          sections.map((section) => (
            <Card key={section.key} flush title={section.title} description={countText(section.items.length)}>
              {section.items.length === 0 ? (
                <p className="gh-empty-row">{section.empty}</p>
              ) : (
                <ul className="gh-rows" aria-busy={work.loading || undefined}>
                  {section.items.map((item) => (
                    <ItemRow key={item.id} item={item} />
                  ))}
                </ul>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
