import { useEffect, useState } from 'react';
import { api, problemFrom } from '../lib/api.ts';
import { MESSAGES_CHANGED, POLL_MS } from '../lib/message-client.ts';
import { Link, useLocation } from '../lib/router.tsx';
import { Icon } from './icons.tsx';

/** Nav link to /messages with the unread count (unmuted conversations), polled while the tab is visible. */
export function MessagesLink({ active, className = 'nav-link' }: { active?: boolean; className?: string }) {
  const { path } = useLocation();
  const [count, setCount] = useState<{ unread: number; capped: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      api('/api/messages/unread').then(
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
    const timer = window.setInterval(visible, POLL_MS.list);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener(MESSAGES_CHANGED, load);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener(MESSAGES_CHANGED, load);
    };
  }, [path]);
  const unread = count?.unread ?? 0;
  const label = count?.capped ? '99+' : String(unread);
  return (
    <Link to="/messages" className={className} aria-current={active ? 'page' : undefined} aria-label={unread ? `Messages, ${label} unread` : 'Messages'}>
      <Icon name="messageSquare" />
      <span>Messages</span>
      {unread > 0 && <span className="badge badge-accent">{label}</span>}
    </Link>
  );
}
