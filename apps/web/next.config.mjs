/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages are TS source — let Next transpile them.
  transpilePackages: ["@mirai/shared", "@mirai/db", "@mirai/x", "@mirai/content"],
  serverExternalPackages: ["@prisma/client", "ioredis"],
};

export default nextConfig;
