import { useEffect, useState } from 'react';
import { api, problemFrom } from '../lib/api.ts';
import { Link, useLocation } from '../lib/router.tsx';
import { Icon } from './icons.tsx';

/** Dispatched on `window` after notices are marked read, so badges refresh. */
export const NOTIFICATIONS_CHANGED = 'portal:notifications-changed';

/** Nav link to /notifications with the unread count, refreshed on focus and after marking read. */
export function NotificationLink({ active, className = 'nav-link' }: { active?: boolean; className?: string }) {
  const { path } = useLocation();
  const [count, setCount] = useState<{ unread: number; capped: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      api('/api/notifications/count').then(
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
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener(NOTIFICATIONS_CHANGED, load);
    };
  }, [path]);
  const unread = count?.unread ?? 0;
  const label = count?.capped ? '99+' : String(unread);
  return (
    <Link
      to="/notifications"
      className={className}
      aria-current={active ? 'page' : undefined}
      aria-label={unread ? `Notifications, ${label} unread` : 'Notifications'}
    >
      <Icon name="inbox" />
      <span>Notifications</span>
      {unread > 0 && <span className="badge badge-accent">{label}</span>}
    </Link>
  );
}
