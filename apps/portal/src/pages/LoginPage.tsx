import { useState } from 'react';
import { auth } from 'void/client';
import logo from '../assets/logo.png';
import { GoogleLogo } from '../components/icons.tsx';
import { Alert, useTitle } from '../components/ui.tsx';
import { safeNext, useLocation } from '../lib/router.tsx';

/**
 * Google is the only way in. Better Auth refuses accounts whose verified email
 * isn't an invited or current member and sends them back here with `?error=`.
 */
export function LoginPage() {
  useTitle('Sign in');
  const { query } = useLocation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const refused = query.get('error');
  const next = safeNext(query.get('next'));

  const signIn = async () => {
    setBusy(true);
    setFailed(false);
    const result = await auth.signIn
      .social({ provider: 'google', callbackURL: next, errorCallbackURL: '/login?error=refused' })
      .catch(() => null);
    // On success the browser is already navigating to Google.
    if (!result || result.error) {
      setBusy(false);
      setFailed(true);
    }
  };

  return (
    <div className="login">
      <section className="login-brand">
        <div className="brand">
          <img src={logo} alt="" width={40} height={40} />
          <span className="brand-text">
            <span className="brand-name">180 Degrees Consulting</span>
            <span className="brand-sub">VIT Chennai</span>
          </span>
        </div>
        <div className="login-hero">
          <p className="overline">Members portal</p>
          <h1>Everyone in the club, in one place.</h1>
          <p>Profiles, positions and terms for members, directors and the board.</p>
        </div>
      </section>
      <section className="login-panel">
        <div className="card login-card">
          <div className="card-inner stack">
            <div>
              <h2>Sign in</h2>
              <p className="muted">Use the Google account with the email the club invited.</p>
            </div>
            {refused && (
              <Alert tone="error" title="That account can't sign in">
                Only invited and current members can sign in. If you were invited, use the Google account for that exact email, or ask a director to
                check your status.
              </Alert>
            )}
            {failed && <Alert tone="error" title="Google sign-in couldn't start. Try again." />}
            <button type="button" className="btn btn-secondary btn-block google-btn" onClick={signIn} disabled={busy} aria-busy={busy || undefined}>
              {busy ? <span className="spinner" aria-hidden="true" /> : <GoogleLogo />}
              Continue with Google
            </button>
            <p className="caption muted">There are no passwords or access tokens. Leaving the club ends access straight away.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
