import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  basePath: process.env.NEXT_PUBLIC_DUDESIGN_WEB_BASE_PATH ?? '',
  transpilePackages: ['@dudesign/contracts'],
}

export default nextConfig
