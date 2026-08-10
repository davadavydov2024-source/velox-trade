/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
    // remotePatterns открыт на любой хост -> Vercel гоняет через свой платный
    // Image Optimization API КАЖДУЮ уникальную внешнюю картинку (скрины предметов и т.п.).
    // На бесплатном/дешёвом тарифе лимит трансформаций быстро кончается -> 402
    // OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED. unoptimized отключает этот пайплайн:
    // next/image просто отдаёт картинку как есть (без ресайза/webp на лету), это уже бесплатно.
    unoptimized: true,
  },
  eslint: {
    // В проекте нет ESLint-конфига — без этой опции Next.js может зависнуть на сборке,
    // пытаясь интерактивно предложить его настроить (что ломает non-interactive билд на Vercel).
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
