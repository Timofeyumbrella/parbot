import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@parbot/shared'],
  // Document parsers ship their own workers and wasm; leave them to Node instead of bundling.
  serverExternalPackages: ['unpdf', 'mammoth', 'linkedom', '@mozilla/readability', 'turndown'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
