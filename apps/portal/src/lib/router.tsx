import { type AnchorHTMLAttributes, type MouseEvent, useEffect, useSyncExternalStore } from 'react';

type Listener = () => void;
const listeners = new Set<Listener>();

function subscribe(listener: Listener) {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

const currentHref = () => window.location.pathname + window.location.search;

export function useLocation() {
  const href = useSyncExternalStore(subscribe, currentHref);
  const url = new URL(href, window.location.origin);
  return { href, path: url.pathname.replace(/(.)\/+$/, '$1'), query: url.searchParams };
}

export function navigate(to: string, options: { replace?: boolean } = {}) {
  if (to !== currentHref()) {
    window.history[options.replace ? 'replaceState' : 'pushState'](null, '', to);
    for (const listener of listeners) listener();
  }
  if (!options.replace) window.scrollTo(0, 0);
}

export function setQuery(updates: Record<string, string | null | undefined>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(updates)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  navigate(url.pathname + url.search, { replace: true });
}

export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const want = pattern.split('/').filter(Boolean);
  const have = path.split('/').filter(Boolean);
  if (want.length !== have.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(':')) {
      try {
        params[want[i].slice(1)] = decodeURIComponent(have[i]);
      } catch {
        return null;
      }
    } else if (want[i] !== have[i]) return null;
  }
  return params;
}

/** Only same-origin paths may be used as a post-sign-in destination. */
export function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/';
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string };

export function Link({ to, onClick, ...rest }: LinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || rest.target) {
      return;
    }
    event.preventDefault();
    navigate(to);
  };
  return <a {...rest} href={to} onClick={handleClick} />;
}

export function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return null;
}
