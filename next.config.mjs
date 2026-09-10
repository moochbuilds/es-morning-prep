/**
 * Static export. All market data is precomputed by scripts/build-data.ts into
 * public/data/*.json, so the deployed site needs no server at all.
 *
 * NEXT_PUBLIC_BASE_PATH is set by the GitHub Pages workflow, because project
 * sites are served from /<repo-name>/. It is empty locally.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
