import { useState } from 'react';
import { EmptyState, ErrorState, LoadingBlock, useTitle } from '../../components/ui.tsx';
import { api, useLoad } from '../../lib/api.ts';
import { formatDate } from '../../lib/format.ts';
import { cleanHtml } from '../../lib/html.ts';
import type { PublicCaseStudy } from '../../lib/types.ts';
import { SectionHeader } from './PublicLayout.tsx';

export function CaseStudyCard({ caseStudy }: { caseStudy: PublicCaseStudy }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="case-card">
      <span className="badge">{caseStudy.tag}</span>
      <h3>{caseStudy.title}</h3>
      {caseStudy.description && <p className="muted">{caseStudy.description}</p>}
      <p className="caption muted">
        By {caseStudy.authorName} · {formatDate(caseStudy.createdAt)}
      </p>
      {open && (
        <div className="case-body">
          {caseStudy.content && <div className="prose" dangerouslySetInnerHTML={{ __html: cleanHtml(caseStudy.content) }} />}
          {caseStudy.sourceFileUrl && (
            <a className="btn btn-secondary btn-sm" href={caseStudy.sourceFileUrl} target="_blank" rel="noopener noreferrer">
              Open source document
            </a>
          )}
        </div>
      )}
      <button type="button" className="text-link case-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Show less' : 'Read more'}
      </button>
    </article>
  );
}

export function CaseStudiesPage() {
  useTitle('Case studies');
  const list = useLoad(() => api('/api/content/case-studies'), []);
  return (
    <div className="site-section stack">
      <SectionHeader eyebrow="Case studies" title="What we've worked on">
        Write-ups from our consultants on projects with non-profits and social enterprises.
      </SectionHeader>
      {list.problem ? (
        <ErrorState problem={list.problem} onRetry={list.reload} />
      ) : !list.data ? (
        <LoadingBlock />
      ) : list.data.length === 0 ? (
        <EmptyState icon="bookOpen" title="No case studies published yet">
          Check back soon.
        </EmptyState>
      ) : (
        <div className="case-grid">
          {[...list.data].reverse().map((cs) => (
            <CaseStudyCard key={cs.id} caseStudy={cs} />
          ))}
        </div>
      )}
    </div>
  );
}
