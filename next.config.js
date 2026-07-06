/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  eslint: {
    // В проекте нет ESLint-конфига — без этой опции Next.js может зависнуть на сборке,
    // пытаясь интерактивно предложить его настроить (что ломает non-interactive билд на Vercel).
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
