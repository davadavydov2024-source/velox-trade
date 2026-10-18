import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { adminAuth } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4 МБ — с запасом под лимит тела запроса на Vercel

// Эти папки может загружать только админ — там лежат изображения товаров/игр/рекламы,
// которые видит весь сайт. "avatars" и "banners" (баннер профиля) может загружать любой
// залогиненный пользователь.
const ADMIN_ONLY_FOLDERS = ["products", "games", "ads", "broadcasts"];
// Остальные папки — строго из этого списка (раньше можно было указать любое имя папки).
const ALLOWED_FOLDERS = new Set(["products", "games", "ads", "broadcasts", "avatars", "banners", "chat-photos", "dm-photos"]);

/** Проверка настоящего содержимого по первым байтам — заголовок Content-Type задаёт клиент и ему нельзя верить. */
function matchesMagic(type: string, b: Uint8Array): boolean {
  const eq = (sig: number[], off = 0) => sig.every((v, i) => b[off + i] === v);
  if (type === "image/jpeg") return eq([0xff, 0xd8, 0xff]);
  if (type === "image/png") return eq([0x89, 0x50, 0x4e, 0x47]);
  if (type === "image/gif") return eq([0x47, 0x49, 0x46, 0x38]);
  if (type === "image/webp") return eq([0x52, 0x49, 0x46, 0x46]) && eq([0x57, 0x45, 0x42, 0x50], 8);
  if (type === "image/svg+xml") return true; // SVG — текст, разрешён только админам (см. ниже)
  return false;
}

function isAdminUid(uid: string): boolean {
  const list = (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(uid);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const folder = formData.get("folder");
    const idToken = formData.get("idToken");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
    }
    if (typeof folder !== "string" || !folder) {
      return NextResponse.json({ error: "Не указана папка загрузки" }, { status: 400 });
    }
    if (typeof idToken !== "string" || !idToken) {
      return NextResponse.json({ error: "Нужно войти в аккаунт, чтобы загружать файлы" }, { status: 401 });
    }

    if (!ALLOWED_FOLDERS.has(folder)) {
      return NextResponse.json({ error: "Недопустимая папка загрузки" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Разрешены только изображения: JPG, PNG, WEBP, GIF, SVG" }, { status: 400 });
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "Файл слишком большой (максимум 4 МБ)" }, { status: 400 });
    }

    let uid: string;
    try {
      const decoded = await adminAuth().verifyIdToken(idToken);
      uid = decoded.uid;
    } catch (err) {
      console.error("blob upload: не удалось проверить токен входа —", err);
      return NextResponse.json(
        { error: "Сессия истекла или Firebase Admin не настроен на сервере. Войди заново и попробуй снова." },
        { status: 401 }
      );
    }

    if (ADMIN_ONLY_FOLDERS.includes(folder) && !isAdminUid(uid)) {
      return NextResponse.json({ error: "Загружать сюда может только администратор." }, { status: 403 });
    }
    // SVG может содержать скрипты — обычным пользователям разрешены только растровые картинки.
    if (file.type === "image/svg+xml" && !isAdminUid(uid)) {
      return NextResponse.json({ error: "SVG могут загружать только администраторы. Используй JPG, PNG, WEBP или GIF." }, { status: 400 });
    }
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (!matchesMagic(file.type, head)) {
      return NextResponse.json({ error: "Содержимое файла не похоже на изображение" }, { status: 400 });
    }
    if (!isAdminUid(uid) && !(await rateLimit(`upload:${uid}`, 40, 60 * 60 * 1000))) {
      return NextResponse.json({ error: "Слишком много загрузок — попробуй позже" }, { status: 429 });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error("blob upload: переменная BLOB_READ_WRITE_TOKEN не задана на сервере");
      return NextResponse.json(
        { error: "Хранилище файлов не настроено на сервере (нет BLOB_READ_WRITE_TOKEN)." },
        { status: 500 }
      );
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const pathname = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;

    const blob = await put(pathname, file, { access: "public" });

    return NextResponse.json({ url: blob.url });
  } catch (err) {
    console.error("blob upload error:", err);
    return NextResponse.json({ error: "Не удалось загрузить файл. Подробности — в логах сервера (Vercel → Logs)." }, { status: 500 });
  }
}
