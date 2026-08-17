'use client';

import { useEffect } from 'react';

/**
 * Extraída como función pura y testeable a propósito — es la ÚNICA regla que
 * decide si algo dispara el redirect a /login del panel entero. Bug real
 * (auditado): un negocio LEGACY podía quedar sin poder abrir NINGUNA
 * pantalla (era otra causa, en `(panel)/layout.tsx`/`onboarding.service.ts`
 * — ver `customers-legacy-access.e2e-spec.ts`), y parte de la auditoría fue
 * confirmar que ESTA regla, la única que sí puede mandar a /login desde el
 * cliente, nunca reacciona a 403 (tenant/rol equivocado) ni 500 (error real
 * del servidor) — solo a 401 (sesión inválida de verdad).
 */
export function shouldRedirectToLogin(status: number): boolean {
  return status === 401;
}

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

      if (isApiRequest(input) && shouldRedirectToLogin(response.status)) {
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
