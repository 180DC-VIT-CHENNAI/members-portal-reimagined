import type { ReactNode } from 'react';
import logo from '../../assets/logo.png';
import { Alert } from '../../components/ui.tsx';
import { api, useLoad } from '../../lib/api.ts';
import { Link, useLocation } from '../../lib/router.tsx';

const NAV = [
  { to: '/', label: 'Home' },
  { to: '/team', label: 'Team' },
  { to: '/case-studies', label: 'Case studies' },
  { to: '/partners', label: 'Clients' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/newsletter', label: 'Newsletter' },
];

/** Shell for the public site: no session, no members chrome. */
export function PublicLayout({ children }: { children: ReactNode }) {
  const { path } = useLocation();
  const maintenance = useLoad(() => api('/api/admin/maintenance'), []);
  return (
    <div className="site">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <Link to="/" className="brand">
          <img src={logo} alt="" width={36} height={36} />
          <span className="brand-text">
            <span className="brand-name">180 Degrees Consulting</span>
            <span className="brand-sub">VIT Chennai</span>
          </span>
        </Link>
        <nav className="site-nav" aria-label="Main">
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} className="site-nav-link" aria-current={path === item.to ? 'page' : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="cluster site-actions">
          <Link to="/login" className="btn btn-ghost btn-sm">
            Members
          </Link>
          <Link to="/work-with-us" className="btn btn-primary btn-sm">
            Work with us
          </Link>
        </div>
      </header>
      {maintenance.data?.enabled && (
        <div className="site-banner">
          <Alert tone="warning" title="Members portal under maintenance">
            {maintenance.data.message}
          </Alert>
        </div>
      )}
      <main id="main" tabIndex={-1} className="site-main">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-grid">
        <div className="stack-sm">
          <h2>180DC VIT Chennai</h2>
          <p className="muted">Vellore Institute of Technology, Chennai Campus</p>
          <a className="text-link" href="mailto:technical.vitc@180dc.org">
            technical.vitc@180dc.org
          </a>
          <div className="cluster">
            <a className="btn btn-secondary btn-sm" href="https://www.linkedin.com/company/180-degrees-consulting-vit-chennai/" target="_blank" rel="noopener noreferrer">
              LinkedIn
            </a>
            <a className="btn btn-secondary btn-sm" href="https://www.instagram.com/180dc.vitc/" target="_blank" rel="noopener noreferrer">
              Instagram
            </a>
          </div>
        </div>
        <div className="stack-sm">
          <h3>About 180DC</h3>
          <p className="muted">
            180 Degrees Consulting is the world's largest consultancy for non-profits and social enterprises, with 190+ branches across universities
            worldwide. Our VIT Chennai branch connects talented students with organizations that need strategic support to maximize their impact.
          </p>
        </div>
        <nav className="stack-sm" aria-label="Footer">
          <h3>Quick links</h3>
          <Link className="text-link" to="/newsletter">Newsletter</Link>
          <Link className="text-link" to="/team">
            Team
          </Link>
          <Link className="text-link" to="/case-studies">
            Case studies
          </Link>
          <Link className="text-link" to="/partners">
            Clients
          </Link>
          <Link className="text-link" to="/gallery">
            Gallery
          </Link>
          <Link className="text-link" to="/work-with-us">
            Work with us
          </Link>
        </nav>
      </div>
      <p className="caption muted site-copyright">&copy; {new Date().getFullYear()} 180DC VIT Chennai. All rights reserved.</p>
    </footer>
  );
}

export function SectionHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="section-header">
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="section-title">{title}</h2>
      {children && <p className="lede">{children}</p>}
    </div>
  );
}
