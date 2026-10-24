import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The embedded Postgres used for local runs must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // Sample CSVs and database migrations are read from disk at runtime, so ship them with the deployment.
  outputFileTracingIncludes: { "/**": ["./data/sample/**", "./drizzle/**"] },
};

export default nextConfig;
