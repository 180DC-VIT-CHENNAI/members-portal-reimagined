import { EmptyState, ErrorState, LoadingBlock, useTitle } from '../../components/ui.tsx';
import { api, useLoad } from '../../lib/api.ts';
import type { Partner } from '../../lib/types.ts';
import { SectionHeader } from './PublicLayout.tsx';

export function PartnerGrid({ partners }: { partners: Partner[] }) {
  if (partners.length === 0) return null;
  return (
    <ul className="partner-grid">
      {partners.map((p) => {
        const body = (
          <>
            {p.logoUrl ? <img src={p.logoUrl} alt="" loading="lazy" /> : <span className="partner-initial">{p.name.slice(0, 1)}</span>}
            <span className="partner-name">{p.name}</span>
          </>
        );
        return (
          <li key={p.id} className="partner-card">
            {p.websiteUrl ? (
              <a href={p.websiteUrl} target="_blank" rel="noopener noreferrer">
                {body}
              </a>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function PartnersPage() {
  useTitle('Clients');
  const list = useLoad(() => api('/api/content/partners'), []);
  return (
    <div className="site-section stack">
      <SectionHeader eyebrow="Clients" title="Organisations we've worked with" />
      {list.problem ? (
        <ErrorState problem={list.problem} onRetry={list.reload} />
      ) : !list.data ? (
        <LoadingBlock />
      ) : list.data.length === 0 ? (
        <EmptyState icon="heart" title="No clients listed yet" />
      ) : (
        <PartnerGrid partners={list.data} />
      )}
    </div>
  );
}
