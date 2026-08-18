/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',        // SPA estático servido pelo backend (1 serviço só)
  trailingSlash: true,     // gera /dailies/index.html etc. (fácil de servir)
  images: { unoptimized: true },
  // pdfjs-dist referencia o pacote Node 'canvas' (usado só no server); no browser
  // não é necessário — alias p/ false evita o erro "Can't resolve 'canvas'".
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = { ...(config.resolve.alias || {}), canvas: false };
    return config;
  },
};
export default nextConfig;
