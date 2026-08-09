import { MetadataRoute } from "next";
import { getGames, getProducts } from "@/lib/products";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://velox-trade-zeta.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/catalog`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/games`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/guide`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/reviews`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${BASE_URL}/leaderboard`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${BASE_URL}/rules`, changeFrequency: "monthly", priority: 0.3 },
  ];

  try {
    const [games, products] = await Promise.all([getGames(), getProducts()]);

    const gamePages: MetadataRoute.Sitemap = games.map((g) => ({
      url: `${BASE_URL}/catalog?game=${g.slug}`,
      changeFrequency: "daily",
      priority: 0.7,
    }));

    const productPages: MetadataRoute.Sitemap = products.map((p) => ({
      url: `${BASE_URL}/product/${p.id}`,
      lastModified: new Date(p.createdAt),
      changeFrequency: "daily",
      priority: 0.6,
    }));

    return [...staticPages, ...gamePages, ...productPages];
  } catch {
    // Firestore недоступен во время сборки — отдаём хотя бы статические страницы,
    // чтобы sitemap не падал целиком из-за временной проблемы с базой.
    return staticPages;
  }
}
