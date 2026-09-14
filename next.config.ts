import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // libSQL ships native bindings; keep it out of the server bundle so Node loads it directly.
  serverExternalPackages: ["@libsql/client", "libsql"],
  // Keep the dev-mode "N" badge out of demo recordings and screenshots.
  devIndicators: false,
};

export default nextConfig;
