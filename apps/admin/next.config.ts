import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  basePath: process.env.NEXT_PUBLIC_DUDESIGN_ADMIN_BASE_PATH ?? '',
}

export default nextConfig
