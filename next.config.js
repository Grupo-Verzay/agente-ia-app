/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  output: "standalone",
  compiler: {
    removeConsole: {
      exclude: ["error"],
    },
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
    // Tree-shaking de librerías con barrel-imports grandes → bundle más liviano
    // y carga más rápida en el cliente. (lucide-react/react-icons ya los optimiza
    // Next por defecto; aquí se agregan las que no están en esa lista.)
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "date-fns",
      "@tanstack/react-table",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "medias3.verzay.co",
      },
      {
        protocol: "https",
        hostname: "flagcdn.com",
      },
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
      },
    ],
  },

  async redirects() {
    return [
      {
        source: "/admin/:path*",
        destination: "/panel/:path*",
        permanent: false,
      },
    ];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value:
              'microphone=(self "https://verzay-web-verzay-ventas.2jcx9p.easypanel.host"), ' +
              'screen-wake-lock=(self "https://verzay-web-verzay-ventas.2jcx9p.easypanel.host")',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
