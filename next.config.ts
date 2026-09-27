import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Tell Webpack not to bundle these native Node.js binaries
  serverExternalPackages: ["@imgly/background-removal-node", "sharp"],
  
  // Correct placement for increasing Server Action limits in newer Next.js versions
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;