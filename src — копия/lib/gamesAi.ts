import { auth } from "./firebase";

export interface AiCategorySuggestion {
  categories: string[];
  allowed: string;
  forbidden: string;
}

/** Просит сервер (ИИ) придумать категории для игры. Бросает Error с понятным текстом при неудаче. */
export async function fetchAiCategories(name: string, slug: string | undefined, existing: string[]): Promise<AiCategorySuggestion> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Нужно войти в аккаунт");
  const res = await fetch("/api/admin/games/ai-categories", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ name, slug, existing }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "ИИ недоступен");
  return data as AiCategorySuggestion;
}
