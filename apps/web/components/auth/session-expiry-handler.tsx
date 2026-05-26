'use client';

import { useEffect } from 'react';

function isApiRequest(input: RequestInfo | URL) {
  const rawUrl =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  try {
    const url = new URL(rawUrl, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

export default function SessionExpiryHandler() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    let redirecting = false;

    const redirectToLogin = () => {
      if (redirecting) return;
      redirecting = true;
      // Route through /session-expired so the server clears the cookie before
      // redirecting to /login. Without this, middleware that checks cookie presence
      // bounces the user back to /dashboard even with an expired JWT.
      // Normalize 0.0.0.0 → localhost (Docker dev binding is not a valid browser dest).
      const host =
        window.location.hostname === '0.0.0.0'
          ? `localhost${window.location.port ? `:${window.location.port}` : ''}`
          : window.location.host;
      window.location.replace(`${window.location.protocol}//${host}/session-expired`);
    };

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await originalFetch(input, init);

      if (isApiRequest(input) && response.status === 401) {
        redirectToLogin();
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
