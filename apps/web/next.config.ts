import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Permite que CI valide en un directorio aislado mientras un servidor de
  // demostracion mantiene `.next` abierto en el mismo workspace compartido.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // 'standalone' sirve para Docker/Railway. Netlify usa su propio runtime de
  // Next (@netlify/plugin-nextjs) y no debe recibir un build standalone.
  output: process.env.NETLIFY ? undefined : 'standalone',
  // `pg` es un paquete de Node (usa net/tls): no debe pasar por el bundler.
  serverExternalPackages: ['pg'],
  transpilePackages: ['@dispatch/contracts', '@dispatch/db'],
  webpack: (config) => {
    // Los paquetes internos son ESM y sus imports relativos llevan extension
    // `.js` (obligatorio en ESM), pero los archivos en disco son `.ts`.
    // Sin este alias webpack busca literalmente `geo.js` y falla el build.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
