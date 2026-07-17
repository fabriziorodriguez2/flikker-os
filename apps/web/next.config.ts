import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Railway terminates TLS at the edge and proxies plain HTTP to Next.js.
    // Without this, req.url is a bare path ("/dashboard") so the Turbopack
    // server runtime calls new URL("/login") without a base and throws
    // TypeError: Invalid URL whenever redirect() is invoked from a server
    // component.  With trustHostHeader, Next.js builds the absolute initURL
    // from req.headers.host, giving redirect() a proper base to resolve against.
    trustHostHeader: true,
  },
};

export default nextConfig;
