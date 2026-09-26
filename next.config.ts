import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Tell Webpack not to bundle these native Node.js binaries
  serverExternalPackages: ["@imgly/background-removal-node", "sharp"],
};

export default nextConfig;