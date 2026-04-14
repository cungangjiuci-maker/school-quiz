/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), 'mammoth', 'pdfjs-dist']
    }
    return config
  },
}

module.exports = nextConfig
