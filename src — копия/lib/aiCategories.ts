/**
 * ИИ придумывает категории товаров для новой игры/приложения (ТОЛЬКО серверный код — секретные ключи).
 * Использует те же ключи, что и ИИ-модерация: сначала бесплатный Gemini (GEMINI_API_KEY), затем
 * платный Claude (ANTHROPIC_API_KEY). Без ключей возвращает null — админ вписывает категории вручную.
 */

export interface CategorySuggestion {
  categories: string[];
  /** Черновик правил для ИИ-модерации (Game.aiAllowed / aiForbidden) — только предложение админу. */
  allowed: string;
  forbidden: string;
}

const TIMEOUT_MS = 20000;

const SYSTEM_PROMPT = `Ты помогаешь маркетплейсу внутриигровых предметов (покупают и продают игроки: предметы, валюту, аккаунты, услуги). Администратор добавил новую игру или приложение — придумай для него категории товаров.

Требования к категориям:
- 5–10 штук, названия на русском, 1–3 слова, без эмодзи и точек;
- то, что реально продают и ищут игроки именно в этой игре (типы предметов, валюта, аккаунты, услуги вроде прокачки), а не абстрактные «Товары» или «Разное»;
- последней — «Прочее»;
- если игру не знаешь, дай универсальные категории (Предметы, Валюта, Аккаунты, Услуги, Прочее) и не выдумывай несуществующие механики.

Ещё предложи короткие правила для проверки объявлений (по 1–2 предложения, до 250 символов каждое):
- "allowed" — что в этой игре обычно можно продавать;
- "forbidden" — что продавать нельзя (читы, скрипты, эксплойты, взломанные аккаунты, предметы из других игр и т.п.).

Отвечай ТОЛЬКО JSON без пояснений и без markdown: {"categories": ["..."], "allowed": "...", "forbidden": "..."}`;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function isAiCategoriesConfigured(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

function buildUserText(gameName: string, slug: string | undefined, existing: string[], otherGames: string[]): string {
  return JSON.stringify(
    {
      игра: gameName,
      slug: slug || null,
      уже_есть_категории: existing.length ? existing : null,
      другие_игры_на_площадке: otherGames.length ? otherGames.slice(0, 40) : null,
    },
    null,
    2
  );
}

/** Достаёт JSON-объект из ответа модели, даже если она обернула его в ```json или добавила текст. */
function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function cleanText(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function sanitize(raw: unknown, existing: string[]): CategorySuggestion | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const have = new Set(existing.map((c) => c.toLowerCase()));
  const seen = new Set<string>();
  const categories: string[] = [];
  for (const item of Array.isArray(obj.categories) ? obj.categories : []) {
    const c = cleanText(item, 40).replace(/[.;,]+$/, "");
    const key = c.toLowerCase();
    if (!c || seen.has(key) || have.has(key)) continue;
    seen.add(key);
    categories.push(c);
    if (categories.length >= 12) break;
  }
  if (categories.length === 0) return null;
  return { categories, allowed: cleanText(obj.allowed, 300), forbidden: cleanText(obj.forbidden, 300) };
}

async function askGemini(userText: string, apiKey: string): Promise<string | null> {
  const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
  const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 600, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) {
    console.error("gemini categories HTTP", res.status, (await res.text().catch(() => "")).slice(0, 200));
    return null;
  }
  const data = (await res.json().catch(() => null)) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> } | null;
  return (data?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("") || null;
}

async function askClaude(userText: string, apiKey: string): Promise<string | null> {
  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: process.env.AI_MODERATION_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 600,
      temperature: 0.4,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userText }],
    }),
  });
  if (!res.ok) {
    console.error("claude categories HTTP", res.status, (await res.text().catch(() => "")).slice(0, 200));
    return null;
  }
  const data = (await res.json().catch(() => null)) as { content?: Array<{ type: string; text?: string }> } | null;
  return (data?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("") || null;
}

export async function suggestGameCategories(opts: {
  gameName: string;
  slug?: string;
  existing?: string[];
  otherGames?: string[];
}): Promise<CategorySuggestion | null> {
  const existing = opts.existing ?? [];
  const userText = buildUserText(opts.gameName, opts.slug, existing, opts.otherGames ?? []);
  const attempts: Array<() => Promise<string | null>> = [];
  if (process.env.GEMINI_API_KEY) attempts.push(() => askGemini(userText, process.env.GEMINI_API_KEY!));
  if (process.env.ANTHROPIC_API_KEY) attempts.push(() => askClaude(userText, process.env.ANTHROPIC_API_KEY!));

  for (const attempt of attempts) {
    try {
      const text = await attempt();
      const result = text ? sanitize(extractJson(text), existing) : null;
      if (result) return result;
    } catch (err: any) {
      console.error("suggestGameCategories error:", err?.name === "AbortError" ? "timeout" : err?.message);
    }
  }
  return null;
}
