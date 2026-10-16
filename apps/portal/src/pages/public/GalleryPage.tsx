import { useTitle } from '../../components/ui.tsx';
import manifest from '../../data/galleryManifest.json';
import { SectionHeader } from './PublicLayout.tsx';

export function GalleryPage() {
  useTitle('Gallery');
  return (
    <div className="site-section stack">
      <SectionHeader eyebrow="Gallery" title="Moments from the club">
        Events, workshops and the people behind them.
      </SectionHeader>
      {manifest.years.map((year) => (
        <section key={year.id} className="stack" aria-labelledby={`gallery-${year.id}`}>
          <h2 id={`gallery-${year.id}`} className="gallery-year">
            {year.label}
          </h2>
          {year.events.map((event) => (
            <article key={event.id} className="stack-sm">
              <h3>{event.title}</h3>
              {event.description && <p className="muted">{event.description}</p>}
              <ul className="gallery-grid">
                {event.images.map((image, index) => (
                  <li key={image}>
                    <img
                      src={`${manifest.cdnBase}/${year.id}/${event.id}/${image}`}
                      alt={`${event.title}, photo ${index + 1}`}
                      loading="lazy"
                      decoding="async"
                      width={400}
                      height={300}
                    />
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
