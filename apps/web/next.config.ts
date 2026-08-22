import type { NextConfig } from "next";

// trustHostHeader is implemented in the Next.js runtime (config-shared.js,
// next-server.js, resolve-routes.js) but was removed from ExperimentalConfig
// TypeScript types in 16.2.1.  Cast to any to keep the build green while still
// setting the value.
//
// Why we need this:
//   Railway terminates TLS at its edge and proxies plain HTTP to the Next.js
//   container.  The Turbopack server-component worker receives only the bare
//   request path (e.g. "/dashboard") — it does not inherit the main process's
//   fetchHostname/port.  When redirect("/login") is called, the worker tries to
//   construct an absolute URL via new URL("/login", initUrl) where initUrl is
//   also a bare path, producing new URL("/login") with no base → throws
//   TypeError: Invalid URL.
//   With trustHostHeader: true the worker reads req.headers.host to build
//   initUrl as "https://flikker.site/dashboard", giving redirect() a valid base.
const nextConfig: NextConfig = {
  output: "standalone",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  experimental: { trustHostHeader: true } as any,
  // Entrada estable de "Mi Flikker" (https://flikker.site/mi) — acceso
  // permanente al cliente sin depender de volver a escanear el QR de
  // ningún negocio. Alias corto de /mi-flikker, no una ruta nueva: toda la
  // lógica de sesión/OTP vive ahí. `permanent: false` (307) a propósito —
  // todavía puede cambiar de destino sin quedar cacheado para siempre en
  // el navegador.
  async redirects() {
    return [
      {
        source: "/mi",
        destination: "/mi-flikker",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
