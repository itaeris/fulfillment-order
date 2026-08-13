/** @type {import('next').NextConfig} */
const nextConfig = {
  generateBuildId: () => `build-${Date.now()}`,
  env: {
    NEXT_PUBLIC_BUILD_ID: `build-${Date.now()}`,
  },
};

export default nextConfig;
