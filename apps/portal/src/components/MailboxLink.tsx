import { useEffect, useState } from 'react';
import { api, problemFrom } from '../lib/api.ts';
import { Link, useLocation } from '../lib/router.tsx';
import { Icon } from './icons.tsx';

/** Dispatched on `window` after a conversation is read, so the badge refreshes. */
export const MAIL_CHANGED = 'portal:mail-changed';

/** Nav link to /mailboxes with unread conversations from mailboxes the reader can read now. */
export function MailboxLink({ active, className = 'nav-link' }: { active?: boolean; className?: string }) {
  const { path } = useLocation();
  const [count, setCount] = useState<{ unread: number; capped: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      api('/api/mailboxes/unread').then(
        (next) => live && setCount(next),
        (err: unknown) => {
          problemFrom(err);
          if (live) setCount(null);
        },
      );
    const visible = () => {
      if (document.visibilityState === 'visible') load();
    };
    load();
    document.addEventListener('visibilitychange', visible);
    window.addEventListener(MAIL_CHANGED, load);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener(MAIL_CHANGED, load);
    };
  }, [path]);
  const unread = count?.unread ?? 0;
  const label = count?.capped ? '99+' : String(unread);
  return (
    <Link to="/mailboxes" className={className} aria-current={active ? 'page' : undefined}
      aria-label={unread ? `Shared mailboxes, ${label} unread` : 'Shared mailboxes'}>
      <Icon name="inbox" />
      <span>Shared mailboxes</span>
      {unread > 0 && <span className="badge badge-accent">{label}</span>}
    </Link>
  );
}
