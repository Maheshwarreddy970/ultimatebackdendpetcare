import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Tell Webpack not to bundle these native Node.js binaries
  serverExternalPackages: ["@huggingface/transformers", "sharp"],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;