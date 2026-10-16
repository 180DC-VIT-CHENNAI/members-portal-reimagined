import { EmptyState, useTitle } from '../../components/ui.tsx';
import { api, useLoad } from '../../lib/api.ts';
import { Link } from '../../lib/router.tsx';
import { CaseStudyCard } from './CaseStudiesPage.tsx';
import { PartnerGrid } from './PartnersPage.tsx';
import { SectionHeader } from './PublicLayout.tsx';

export function LandingPage() {
  useTitle('Social impact consulting');
  const caseStudies = useLoad(() => api('/api/content/case-studies'), []);
  const partners = useLoad(() => api('/api/content/partners'), []);
  const latest = (caseStudies.data ?? []).slice(-3).reverse();
  return (
    <>
      <section className="hero">
        <div className="hero-text">
          <span className="eyebrow">Social Impact Consulting</span>
          <h1>
            Transforming non-profits.
            <br />
            Empowering students.
          </h1>
          <p className="lede">
            180 Degrees Consulting VIT Chennai is part of the world's largest university-based consultancy. We connect students with social
            enterprises to achieve meaningful impact.
          </p>
          <div className="cluster">
            <a href="#about" className="btn btn-secondary">
              Who we are
            </a>
            <Link to="/work-with-us" className="btn btn-primary">
              Work with us
            </Link>
          </div>
        </div>
        <div className="hero-media">
          <img src="/images/VIT-chennai.png" alt="VIT Chennai campus" width={640} height={480} fetchPriority="high" />
        </div>
      </section>

      <section id="about" className="site-section">
        <div className="card">
          <div className="card-inner stack">
            <SectionHeader eyebrow="01 - About" title="About our branch">
              Founded at VIT Chennai, our branch consists of high-achieving, creative students driven to affect real change. We provide socially
              conscious organizations with very high quality and free consulting services.
            </SectionHeader>
            <dl className="stat-grid">
              {[
                ['50+', 'Consultants'],
                ['20+', 'Projects completed'],
                ['100%', 'Client satisfaction'],
              ].map(([value, label]) => (
                <div key={label} className="stat">
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className="site-section stack">
        <SectionHeader eyebrow="02 - Case studies" title="Latest case studies" />
        {latest.length === 0 ? (
          caseStudies.loading ? null : <EmptyState icon="bookOpen" title="No case studies published yet">Check back soon.</EmptyState>
        ) : (
          <div className="case-grid">
            {latest.map((cs) => (
              <CaseStudyCard key={cs.id} caseStudy={cs} />
            ))}
          </div>
        )}
        <Link to="/case-studies" className="text-link">
          All case studies
        </Link>
      </section>

      <section className="site-section stack">
        <SectionHeader eyebrow="03 - Leadership" title="Meet the team">
          The people running 180DC VIT Chennai this term.
        </SectionHeader>
        <Link to="/team" className="btn btn-secondary">
          See the team
        </Link>
      </section>

      <section className="site-section stack">
        <SectionHeader eyebrow="04 - Clients" title="Our clients" />
        <PartnerGrid partners={partners.data ?? []} />
      </section>

      <section className="site-section">
        <div className="cta-band">
          <h2>Running a non-profit or social enterprise?</h2>
          <p>Tell us what you're working on. Our consultants take on projects for free.</p>
          <Link to="/work-with-us" className="btn btn-primary">
            Work with us
          </Link>
        </div>
      </section>
    </>
  );
}
