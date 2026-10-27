import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Self-contained server for the production Docker image (see Dockerfile).
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    // Browsers that request /favicon.ico directly get the store isotipo.
    return [{ source: "/favicon.ico", destination: "/api/brand/isotipo", permanent: false }];
  },
  async rewrites() {
    const apiOrigin = process.env.XPANDER_API_ORIGIN ?? "http://127.0.0.1:8080";

    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
