import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // This app lives in a subfolder of the repo; pin the root so a stray
  // lockfile in the parent folder isn't picked up as the workspace root.
  turbopack: { root: __dirname },
};

export default nextConfig;
