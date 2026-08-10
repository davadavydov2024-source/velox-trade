import { Game } from "@/types";

// Категории игр оставлены как стартовая навигация (не товары) — позже можно тоже вынести в админку.
export const MOCK_GAMES: Game[] = [
  { id: "roblox", name: "Roblox", slug: "roblox", image: "https://images.unsplash.com/photo-1614741118887-7a4ee193a5fa?w=300&q=80" },
  { id: "grow-a-garden", name: "Grow a Garden", slug: "grow-a-garden", image: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=300&q=80" },
  { id: "adopt-me", name: "Adopt Me", slug: "adopt-me", image: "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=300&q=80" },
  { id: "blox-fruits", name: "Blox Fruits", slug: "blox-fruits", image: "https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=300&q=80" },
  { id: "mm2", name: "MM2", slug: "mm2", image: "https://images.unsplash.com/photo-1551033406-611cf9a28f67?w=300&q=80" },
  { id: "blade-ball", name: "Blade Ball", slug: "blade-ball", image: "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=300&q=80" },
  { id: "steal-a-brainrot", name: "Steal a Brainrot", slug: "steal-a-brainrot", image: "https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=300&q=80" },
  { id: "anime-adventures", name: "Anime Adventures", slug: "anime-adventures", image: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&q=80" },
  { id: "pet-simulator", name: "Pet Simulator", slug: "pet-simulator", image: "https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=300&q=80" },
];
