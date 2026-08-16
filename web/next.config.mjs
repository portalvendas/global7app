/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',        // SPA estático servido pelo backend (1 serviço só)
  trailingSlash: true,     // gera /dailies/index.html etc. (fácil de servir)
  images: { unoptimized: true },
};
export default nextConfig;
