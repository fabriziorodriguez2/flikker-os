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
      // 0.0.0.0 is an invalid browser destination (Docker dev binding). Normalize to localhost.
      const host =
        window.location.hostname === '0.0.0.0'
          ? `localhost${window.location.port ? `:${window.location.port}` : ''}`
          : window.location.host;
      window.location.replace(`${window.location.protocol}//${host}/login?reason=session_expired`);
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
