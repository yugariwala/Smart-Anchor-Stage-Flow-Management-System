/**
 * Hash routing, no router dependency.
 *
 * The invite secret rides as a query param INSIDE the fragment, so it never reaches the
 * server, a proxy or a log (§12). `consumeInviteCode` strips only `code` via
 * `history.replaceState`, leaving the route intact.
 */

import { useEffect, useState } from 'react';

export type Route =
  | { kind: 'landing' }
  | { kind: 'setup'; eventId: string }
  | { kind: 'console'; eventId: string }
  | { kind: 'anchor'; eventId: string }
  | { kind: 'join'; eventId: string };

const parse = (hash: string): Route => {
  const raw = hash.replace(/^#\/?/, '');
  const [pathPart] = raw.split('?');
  const segments = (pathPart ?? '').split('/').filter((s) => s.length > 0);

  if (segments[0] === 'event' && segments[1] !== undefined) {
    if (segments[2] === 'console') return { kind: 'console', eventId: segments[1] };
    if (segments[2] === 'setup') return { kind: 'setup', eventId: segments[1] };
  }
  if (segments[0] === 'anchor' && segments[1] !== undefined) {
    return { kind: 'anchor', eventId: segments[1] };
  }
  if (segments[0] === 'join' && segments[1] !== undefined) {
    return { kind: 'join', eventId: segments[1] };
  }
  return { kind: 'landing' };
};

export const useRoute = (): Route => {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = (): void => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
};

export const navigate = (hash: string): void => {
  window.location.hash = hash;
};

/**
 * Reads the invite secret out of the fragment and removes it from the address bar in the
 * same turn, so it is not left in browser history or copied by accident.
 */
export const consumeInviteCode = (): string | null => {
  const hash = window.location.hash;
  const at = hash.indexOf('?');
  if (at === -1) return null;
  const params = new URLSearchParams(hash.slice(at + 1));
  const code = params.get('code');
  if (code === null) return null;
  params.delete('code');
  const rest = params.toString();
  const cleaned = `${hash.slice(0, at)}${rest.length > 0 ? `?${rest}` : ''}`;
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}${cleaned}`);
  return code;
};

/** The link an organizer hands an anchor. The secret lives only in the fragment. */
export const inviteLink = (eventId: string, code: string): string =>
  `${window.location.origin}${window.location.pathname}#/join/${eventId}?code=${encodeURIComponent(code)}`;
