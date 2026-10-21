import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from 'void/client';
import logo from './assets/logo.png';
import { Icon, type IconName } from './components/icons.tsx';
import { Avatar, ErrorState, LoadingBlock } from './components/ui.tsx';
import { NotificationLink } from './components/NotificationLink.tsx';
import { MessagesLink } from './components/MessagesLink.tsx';
import { MessagesPage } from './pages/MessagesPage.tsx';
import { ConversationPage } from './pages/ConversationPage.tsx';
import { NotificationPreferencesPage } from './pages/NotificationPreferencesPage.tsx';
import { MessageReportsPage } from './pages/admin/MessageReportsPage.tsx';
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
import { EmailQueuePage } from './pages/admin/EmailQueuePage.tsx';
import { SendEmailPage } from './pages/admin/SendEmailPage.tsx';
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
import { MeetsPage } from './pages/MeetsPage.tsx';
import { MorePage } from './pages/MorePage.tsx';
import { TodayPage } from './pages/TodayPage.tsx';
import { NotificationsPage } from './pages/NotificationsPage.tsx';
import { ProjectFormPage } from './pages/ProjectFormPage.tsx';
import { ProjectPage } from './pages/ProjectPage.tsx';
import { ProjectsPage } from './pages/ProjectsPage.tsx';
import { TeamInstanceFormPage } from './pages/TeamInstanceFormPage.tsx';
import { TeamInstancePage } from './pages/TeamInstancePage.tsx';
import { TeamInstancesPage } from './pages/TeamInstancesPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { PersonPage } from './pages/PersonPage.tsx';
import { CaseStudiesPage } from './pages/public/CaseStudiesPage.tsx';
import { GalleryPage } from './pages/public/GalleryPage.tsx';
import { LandingPage } from './pages/public/LandingPage.tsx';
import { PartnersPage } from './pages/public/PartnersPage.tsx';
import { PublicLayout } from './pages/public/PublicLayout.tsx';
import { TeamPage } from './pages/public/TeamPage.tsx';
import { WorkWithUsPage } from './pages/public/WorkWithUsPage.tsx';
import { SubscriberPage } from './pages/public/SubscriberPage.tsx';
import { UnsubscribePage } from './pages/public/UnsubscribePage.tsx';
import { NewsletterEditorPage } from './pages/NewsletterEditorPage.tsx';
import { NewsletterFormPage } from './pages/NewsletterFormPage.tsx';
import { NewsletterEventPage } from './pages/NewsletterEventPage.tsx';
import { NewslettersPage, NewsletterArticlePage } from './pages/public/NewslettersPage.tsx';
import { NewsletterSubscribersPage } from './pages/admin/NewsletterSubscribersPage.tsx';
import { MailboxesPage } from './pages/mail/MailboxesPage.tsx';
import { MailboxPage } from './pages/mail/MailboxPage.tsx';
import { DraftPage } from './pages/mail/DraftPage.tsx';
import { EngagementPage } from './pages/crm/EngagementPage.tsx';
import { OpportunityPage } from './pages/crm/OpportunityPage.tsx';
import { OrganizationPage } from './pages/crm/OrganizationPage.tsx';
import { OrganizationsPage } from './pages/crm/OrganizationsPage.tsx';
import { PipelinePage } from './pages/crm/PipelinePage.tsx';

const LetterStudioPage = lazy(() => import('./pages/letters/LetterStudioPage.tsx').then((module) => ({ default: module.LetterStudioPage })));

type Boot = { state: 'loading' } | { state: 'signed-out' } | { state: 'error'; problem: ApiProblem } | { state: 'ready'; me: MeResponse };

/** Public pages render without the session boot; everything else is the members portal. */
function publicPage(path: string) {
  if (path === '/') return <LandingPage />;
  if (path === '/subscriber') return <SubscriberPage />;
  if (path === '/newsletter') return <NewslettersPage />;
  const issue = matchPath('/newsletter/:id', path);
  if (issue) return <NewsletterArticlePage id={issue.id} />;
  if (path === '/unsubscribe') return <UnsubscribePage />;
  const unsubscribe = matchPath('/unsubscribe/:token', path);
  if (unsubscribe) return <UnsubscribePage token={unsubscribe.token} />;
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

  const home = '/today';
  const tools = visibleAdminTools(permissions);

  // Phones show the first four entries as tabs and the rest under More; `tab: false` sends an entry straight to More.
  const nav: Array<{ to: string; label: string; icon: IconName; show: boolean; active: boolean; tab?: boolean }> = [
    { to: '/today', label: 'Today', icon: 'checkCircle', show: true, active: path === '/today' },
    { to: '/messages', label: 'Messages', icon: 'messageSquare', show: true, active: path.startsWith('/messages') },
    { to: '/notifications', label: 'Notifications', icon: 'inbox', show: true, active: path === '/notifications', tab: false },
    { to: '/mailboxes', label: 'Shared mailboxes', icon: 'inbox', show: true, active: path.startsWith('/mailboxes'), tab: false },
    { to: '/people', label: 'Directory', icon: 'users', show: can(permissions, 'people.view'), active: path === '/people', tab: false },
    // On phones the header avatar links to the profile.
    { to: `/people/${me.person.id}`, label: 'My profile', icon: 'user', show: true, active: path === `/people/${me.person.id}`, tab: false },
    { to: '/announcements', label: 'Announcements', icon: 'megaphone', show: true, active: path === '/announcements', tab: false },
    { to: '/meets', label: 'Meets', icon: 'calendar', show: can(permissions, 'meets.view'), active: path === '/meets' },
    { to: '/crm', label: 'Clients', icon: 'arrowRightLeft', show: can(permissions, 'crm.view'), active: path.startsWith('/crm'), tab: false },
    { to: '/projects', label: 'Projects', icon: 'clipboard', show: true, active: path.startsWith('/projects') },
    {
      to: '/teams',
      label: 'Team instances',
      icon: 'trophy',
      show: can(permissions, 'team_instances.view') || can(permissions, 'team_instances.manage'),
      active: path.startsWith('/teams'),
      tab: false,
    },
    {
      to: `/departments/${me.person.departmentId ?? ''}`,
      label: 'My department',
      icon: 'briefcase',
      show: Boolean(me.person.departmentId) && can(permissions, 'departments.members.view', me.person.departmentId),
      active: path.startsWith('/departments/'),
    },
    { to: '/files', label: 'Files', icon: 'fileText', show: can(permissions, 'files.view'), active: path === '/files' },
    { to: '/admin', label: 'Admin', icon: 'grid', show: tools.length > 0, active: path.startsWith('/admin') || path.startsWith('/newsletter-editor') || path.startsWith('/letters') },
  ];
  const visible = nav.filter((item) => item.show);
  const tabs = visible.filter((item) => item.tab !== false).slice(0, 4);
  const overflow = visible.filter((item) => !tabs.includes(item));
  const page = path === '/more' ? <MorePage items={overflow} /> : route(path, home, query.get('next'));

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
                    {item.to === '/messages' ? <MessagesLink active={item.active} /> : item.to === '/notifications' ? <NotificationLink active={item.active} /> : <Link to={item.to} className="nav-link" aria-current={item.active ? 'page' : undefined}>
                      <Icon name={item.icon} size={18} />
                      {item.label}
                    </Link>}
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
          {tabs.map((item) => (
            item.to === '/messages' ? <MessagesLink key={item.to} active={item.active} className="tab" /> : <Link key={item.to} to={item.to} className="tab" aria-current={item.active ? 'page' : undefined}>
              <Icon name={item.icon} size={20} />
              {item.label}
            </Link>
          ))}
          {overflow.length > 0 && (
            <Link to="/more" className="tab" aria-current={path === '/more' || overflow.some((item) => item.active) ? 'page' : undefined}>
              <Icon name="more" size={20} />
              More
            </Link>
          )}
        </nav>
      </div>
    </SessionProvider>
  );
}

function route(path: string, home: string, next: string | null) {
  if (path === '/me') return <Redirect to={home} />;
  if (path === '/login') return <Redirect to={next && next.startsWith('/') && !next.startsWith('//') ? next : home} />;
  if (path === '/today') return <TodayPage />;
  if (path === '/notifications') return <NotificationsPage />;
  if (path === '/mailboxes') return <MailboxesPage />;
  const composeMail = matchPath('/mailboxes/:id/compose', path);
  if (composeMail) return <DraftPage key={path} id={composeMail.id} />;
  const editMail = matchPath('/mailboxes/:id/drafts/:draftId/edit', path);
  if (editMail) return <DraftPage key={path} id={editMail.id} draftId={editMail.draftId} edit />;
  const mailDraft = matchPath('/mailboxes/:id/drafts/:draftId', path);
  if (mailDraft) return <DraftPage key={path} id={mailDraft.id} draftId={mailDraft.draftId} />;
  const mailbox = matchPath('/mailboxes/:id', path);
  if (mailbox) return <MailboxPage key={path} id={mailbox.id} />;
  if (path === '/crm') return <PipelinePage />;
  if (path === '/crm/organizations') return <OrganizationsPage />;
  const crmOrganization = matchPath('/crm/organizations/:id', path);
  if (crmOrganization) return <OrganizationPage key={path} id={crmOrganization.id} />;
  const crmOpportunity = matchPath('/crm/opportunities/:id', path);
  if (crmOpportunity) return <OpportunityPage key={path} id={crmOpportunity.id} />;
  const crmEngagement = matchPath('/crm/engagements/:id', path);
  if (crmEngagement) return <EngagementPage key={path} id={crmEngagement.id} />;
  if (path === '/notifications/preferences') return <NotificationPreferencesPage />;
  if (path === '/messages') return <MessagesPage />;
  const conversation = matchPath('/messages/:id', path);
  if (conversation) return <ConversationPage key={conversation.id} id={conversation.id} />;
  if (path === '/admin/message-reports') return <MessageReportsPage />;
  if (path === '/people') return <DirectoryPage />;
  if (path === '/announcements') return <AnnouncementsPage />;
  if (path === '/meets') return <MeetsPage />;
  if (path === '/projects') return <ProjectsPage />;
  if (path === '/projects/new') return <ProjectFormPage />;
  const projectEdit = matchPath('/projects/:id/edit', path);
  if (projectEdit) return <ProjectFormPage key={projectEdit.id} id={projectEdit.id} />;
  const project = matchPath('/projects/:id', path);
  if (project) return <ProjectPage key={project.id} id={project.id} />;
  if (path === '/teams') return <TeamInstancesPage />;
  if (path === '/teams/new') return <TeamInstanceFormPage />;
  const instanceEdit = matchPath('/teams/:id/edit', path);
  if (instanceEdit) return <TeamInstanceFormPage key={instanceEdit.id} id={instanceEdit.id} />;
  const instance = matchPath('/teams/:id', path);
  if (instance) return <TeamInstancePage key={instance.id} id={instance.id} />;
  if (path === '/files') return <FilesPage />;
  const department = matchPath('/departments/:id', path);
  if (department) return <DepartmentPage key={department.id} id={department.id} />;
  const person = matchPath('/people/:id', path);
  if (person) return <PersonPage key={person.id} id={person.id} />;
  if (path === '/letters') return <Suspense fallback={<LoadingBlock label="Loading letter studio" />}><LetterStudioPage /></Suspense>;
  if (path === '/subscriber/newsletter') return <Redirect to="/newsletter-editor" />;
  if (path === '/newsletter-editor') return <NewsletterEditorPage />;
  if (path === '/newsletter-editor/new') return <NewsletterFormPage />;
  if (path === '/newsletter-editor/events') return <NewsletterEventPage />;
  const editorial = matchPath('/newsletter-editor/:id', path);
  if (editorial) return <NewsletterFormPage key={editorial.id} id={editorial.id} />;
  if (path === '/admin') return <AdminHome />;
  if (path === '/admin/newsletter-subscribers') return <NewsletterSubscribersPage />;
  if (path === '/admin/email-queue') return <EmailQueuePage />;
  if (path === '/admin/send-email') return <SendEmailPage />;
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

