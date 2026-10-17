/**
 * The portal's sending address. 180dc.vitcc.org is onboarded for Cloudflare
 * Email Sending in the deploy account, and void.config.ts limits the
 * SEND_EMAIL binding to this one address. Nothing receives mail here, so mail
 * a person writes sets Reply-To to that person.
 */
export const SENDER_ADDRESS = 'noreply@180dc.vitcc.org';

/** A display name on the shared address, e.g. `180DC Consulting <noreply@180dc.vitcc.org>`. */
export function sender(name: string): string {
  return `${name} <${SENDER_ADDRESS}>`;
}
