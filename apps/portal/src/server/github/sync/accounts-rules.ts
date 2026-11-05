const LOGIN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;

/** GitHub's login rule as the contract states it: 1-39 characters, letters, digits and hyphens, no leading hyphen. */
export function isValidLogin(login: string): boolean {
  return LOGIN.test(login);
}

/** The login a profile URL such as https://www.github.com/Octocat/ names, or null. Only a suggestion, never an identity. */
export function loginFromGithubUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:' || (host !== 'github.com' && host !== 'www.github.com')) return null;
  const segments = parsed.pathname.split('/').filter((part) => part.length > 0);
  if (segments.length !== 1) return null;
  const login = segments[0] ?? '';
  return isValidLogin(login) ? login : null;
}
