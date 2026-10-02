import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The share-card renderer reads these fonts from disk at request time.
  outputFileTracingIncludes: { "/u/[handle]/opengraph-image": ["./assets/fonts/*.woff"] },
};

export default nextConfig;
