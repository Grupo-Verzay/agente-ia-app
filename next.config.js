/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  output: "standalone",
  compiler: {
    // En produccion se borran las llamadas a console MENOS estas.
    //
    // Estaba solo `error`, y eso se llevaba por delante TODO el diagnostico de
    // la App: `console.warn` y `console.info` desaparecian del build. Dos dias
    // pidiendo capturas de una consola que no podia decir nada, porque los
    // avisos ni existian en el codigo que corre.
    //
    // Este repo se apoya en esos avisos a proposito -CLAUDE.md tiene una regla
    // entera sobre que un fallo nunca puede ser mudo-, asi que `warn` e `info`
    // se quedan. `log` y `debug` siguen fuera: esos si son ruido de desarrollo.
    removeConsole: {
      exclude: ["error", "warn", "info"],
    },
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
    // sharp es un módulo nativo: se usa en runtime en /api/brand-icon para
    // normalizar el logo del reseller a ícono cuadrado. Externalizarlo evita
    // que webpack intente empaquetarlo.
    serverComponentsExternalPackages: ["sharp"],
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
              'microphone=(self "https://verzay-web-verzay-ventas.2jcx9p.easypanel.host" "https://copiloto.ia-app.com"), ' +
              'screen-wake-lock=(self "https://verzay-web-verzay-ventas.2jcx9p.easypanel.host" "https://copiloto.ia-app.com")',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
