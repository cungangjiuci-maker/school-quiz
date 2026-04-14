/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), 'mammoth', 'canvas']
    }
    return config
  },
}

module.exports = nextConfig
