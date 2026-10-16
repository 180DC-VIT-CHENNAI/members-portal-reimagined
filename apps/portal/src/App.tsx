import { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from 'void/client';
import logo from './assets/logo.png';
import { Icon, type IconName } from './components/icons.tsx';
import { Avatar, ErrorState } from './components/ui.tsx';
import { can, type PermissionMap, visibleAdminTools } from './lib/access.ts';
import { api, clearCache, onUnauthorized, problemFrom } from './lib/api.ts';
import type { ApiProblem } from './lib/errors.ts';
import { Link, matchPath, Redirect, useLocation } from './lib/router.tsx';
import { type Session, SessionProvider } from './lib/session.tsx';
import type { MeResponse } from './lib/types.ts';
import { AnnouncementsPage } from './pages/AnnouncementsPage.tsx';
import { AdminHome } from './pages/admin/AdminHome.tsx';
import { CaseStudiesAdminPage } from './pages/admin/CaseStudiesAdminPage.tsx';
import { ConsultingAdminPage } from './pages/admin/ConsultingAdminPage.tsx';
import { MaintenancePage } from './pages/admin/MaintenancePage.tsx';
import { PartnersAdminPage } from './pages/admin/PartnersAdminPage.tsx';
import { AuditPage } from './pages/admin/AuditPage.tsx';
import { ImportPage } from './pages/admin/ImportPage.tsx';
import { InvitePage } from './pages/admin/InvitePage.tsx';
import { PositionsPage } from './pages/admin/PositionsPage.tsx';
import { RolesPage } from './pages/admin/RolesPage.tsx';
import { TermsPage } from './pages/admin/TermsPage.tsx';
import { DepartmentPage } from './pages/DepartmentPage.tsx';
import { DirectoryPage } from './pages/DirectoryPage.tsx';
import { FilesPage } from './pages/FilesPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { PersonPage } from './pages/PersonPage.tsx';
import { CaseStudiesPage } from './pages/public/CaseStudiesPage.tsx';
import { GalleryPage } from './pages/public/GalleryPage.tsx';
import { LandingPage } from './pages/public/LandingPage.tsx';
import { PartnersPage } from './pages/public/PartnersPage.tsx';
import { PublicLayout } from './pages/public/PublicLayout.tsx';
import { TeamPage } from './pages/public/TeamPage.tsx';
import { WorkWithUsPage } from './pages/public/WorkWithUsPage.tsx';

type Boot = { state: 'loading' } | { state: 'signed-out' } | { state: 'error'; problem: ApiProblem } | { state: 'ready'; me: MeResponse };

/** Public pages render without the session boot; everything else is the members portal. */
function publicPage(path: string) {
  if (path === '/') return <LandingPage />;
  if (path === '/team') return <TeamPage />;
  if (path === '/case-studies') return <CaseStudiesPage />;
  if (path === '/partners') return <PartnersPage />;
  if (path === '/gallery') return <GalleryPage />;
  if (path === '/work-with-us') return <WorkWithUsPage />;
  return null;
}

export function App() {
  const { path } = useLocation();
  const page = publicPage(path);
  if (page) return <PublicLayout key={path}>{page}</PublicLayout>;
  return <MembersApp />;
}

function MembersApp() {
  const { path, href } = useLocation();
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });

  const load = useCallback(() => {
    api('/api/me').then(
      (me) => setBoot({ state: 'ready', me }),
      (err: unknown) => {
        const problem = problemFrom(err);
        setBoot(problem.status === 401 ? { state: 'signed-out' } : { state: 'error', problem });
      },
    );
  }, []);

  useEffect(() => {
    load();
    onUnauthorized(() => {
      clearCache();
      setBoot({ state: 'signed-out' });
    });
  }, [load]);

  if (boot.state === 'loading') {
    return (
      <div className="boot" role="status" aria-label="Loading the portal">
        <img src={logo} alt="" width={56} height={56} />
        <span className="boot-bar" />
      </div>
    );
  }
  if (boot.state === 'error') {
    return (
      <main className="page page-narrow">
        <ErrorState problem={boot.problem} onRetry={load} title="The portal couldn't start" />
      </main>
    );
  }
  if (boot.state === 'signed-out') {
    if (path !== '/login') return <Redirect to={`/login?next=${encodeURIComponent(href)}`} />;
    return <LoginPage />;
  }
  return <SignedIn me={boot.me} refresh={load} />;
}

function SignedIn({ me, refresh }: { me: MeResponse; refresh: () => void }) {
  const { path, query } = useLocation();
  const permissions = me.permissions as PermissionMap;
  const session: Session = useMemo(
    () => ({
      me: me.person,
      permissions,
      can: (permission, departmentId) => can(permissions, permission, departmentId),
      refresh,
      signOut: () => {
        void auth.signOut().finally(() => {
          clearCache();
          window.location.assign('/login');
        });
      },
    }),
    [me, permissions, refresh],
  );

  const home = can(permissions, 'people.view') ? '/people' : `/people/${me.person.id}`;
  const page = route(path, home, query.get('next'));
  const tools = visibleAdminTools(permissions);

  const nav: Array<{ to: string; label: string; icon: IconName; show: boolean; active: boolean }> = [
    { to: '/people', label: 'Directory', icon: 'users', show: can(permissions, 'people.view'), active: path === '/people' },
    { to: `/people/${me.person.id}`, label: 'My profile', icon: 'user', show: true, active: path === `/people/${me.person.id}` },
    { to: '/announcements', label: 'Announcements', icon: 'megaphone', show: true, active: path === '/announcements' },
    {
      to: `/departments/${me.person.departmentId ?? ''}`,
      label: 'My department',
      icon: 'briefcase',
      show: Boolean(me.person.departmentId) && can(permissions, 'departments.members.view', me.person.departmentId),
      active: path.startsWith('/departments/'),
    },
    { to: '/files', label: 'Files', icon: 'fileText', show: can(permissions, 'files.view'), active: path === '/files' },
    { to: '/admin', label: 'Admin', icon: 'grid', show: tools.length > 0, active: path.startsWith('/admin') },
  ];

  return (
    <SessionProvider value={session}>
      <div className="app">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="app-header">
          <Link to={home} className="brand">
            <img src={logo} alt="" width={32} height={32} />
            <span className="brand-text">
              <span className="brand-name">180 Degrees Consulting</span>
              <span className="brand-sub">VIT Chennai portal</span>
            </span>
          </Link>
          <div className="header-actions">
            <Link to="/" className="btn btn-ghost btn-icon" aria-label="Public site" title="Public site">
              <Icon name="globe" size={18} />
            </Link>
            <Link to={`/people/${me.person.id}`} className="me-chip">
              <Avatar name={me.person.fullName} photo={me.person.photoKey} size={32} />
              <span className="me-text">
                <span className="me-name">{me.person.fullName}</span>
                <span className="me-role">{me.person.email}</span>
              </span>
            </Link>
            <button type="button" className="btn btn-ghost btn-icon" onClick={session.signOut} aria-label="Sign out" title="Sign out">
              <Icon name="logOut" size={18} />
            </button>
          </div>
        </header>
        <nav className="sidebar" aria-label="Main">
          <div className="nav-group">
            <ul className="nav-list">
              {nav
                .filter((item) => item.show)
                .map((item) => (
                  <li key={item.to}>
                    <Link to={item.to} className="nav-link" aria-current={item.active ? 'page' : undefined}>
                      <Icon name={item.icon} size={18} />
                      {item.label}
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
          {tools.length > 0 && (
            <div className="nav-group">
              <p className="nav-label">Admin</p>
              <ul className="nav-list">
                {tools.map((tool) => (
                  <li key={tool.path}>
                    <Link to={tool.path} className="nav-link" aria-current={path === tool.path ? 'page' : undefined}>
                      <Icon name={tool.icon} size={18} />
                      {tool.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </nav>
        <main className="main" id="main" tabIndex={-1}>
          {page}
        </main>
        <nav className="tabbar" aria-label="Main">
          {nav
            .filter((item) => item.show)
            .map((item) => (
              <Link key={item.to} to={item.to} className="tab" aria-current={item.active ? 'page' : undefined}>
                <Icon name={item.icon} size={20} />
                {item.label}
              </Link>
            ))}
        </nav>
      </div>
    </SessionProvider>
  );
}

function route(path: string, home: string, next: string | null) {
  if (path === '/me') return <Redirect to={home} />;
  if (path === '/login') return <Redirect to={next && next.startsWith('/') && !next.startsWith('//') ? next : home} />;
  if (path === '/people') return <DirectoryPage />;
  if (path === '/announcements') return <AnnouncementsPage />;
  if (path === '/files') return <FilesPage />;
  const department = matchPath('/departments/:id', path);
  if (department) return <DepartmentPage key={department.id} id={department.id} />;
  const person = matchPath('/people/:id', path);
  if (person) return <PersonPage key={person.id} id={person.id} />;
  if (path === '/admin') return <AdminHome />;
  if (path === '/admin/invite') return <InvitePage />;
  if (path === '/admin/import') return <ImportPage />;
  if (path === '/admin/positions') return <PositionsPage />;
  if (path === '/admin/terms') return <TermsPage />;
  if (path === '/admin/roles') return <RolesPage />;
  if (path === '/admin/audit') return <AuditPage />;
  if (path === '/admin/case-studies') return <CaseStudiesAdminPage />;
  if (path === '/admin/partners') return <PartnersAdminPage />;
  if (path === '/admin/consulting') return <ConsultingAdminPage />;
  if (path === '/admin/announcements') return <AnnouncementsPage admin />;
  if (path === '/admin/maintenance') return <MaintenancePage />;
  return <NotFoundPage />;
}

