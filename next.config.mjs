/** @type {import('next').NextConfig} */
const nextConfig = {
  // 100% client-side: static HTML export, no server required.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    // pdfjs-dist ships a worker + canvas fallback that reference node built-ins.
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;