/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  generateBuildId: () => `build-${Date.now()}`,
  env: {
    NEXT_PUBLIC_BUILD_ID: `build-${Date.now()}`,
  },
  async redirects() {
    return [{ source: "/overdue", destination: "/scanner-barcode", permanent: true }];
  },
};

export default nextConfig;
