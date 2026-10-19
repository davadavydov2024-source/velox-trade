import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { randomBytes } from "crypto";
import { adminAuth } from "@/lib/firebaseAdmin";
import { isAdminUid } from "@/lib/isAdmin";
import { rateLimit } from "@/lib/apiRateLimit";

export const runtime = "nodejs";

const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4 МБ — с запасом под лимит тела запроса на Vercel

// Тип -> расширение. Расширение берём из проверенного типа, а не из имени файла от клиента.
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

// Только известные папки (раньше принималась любая строка). Эти — только для админа:
const ADMIN_ONLY_FOLDERS = ["products", "games", "ads", "broadcasts", "news", "contests", "site-screens"];
const USER_FOLDERS = ["avatars", "banners", "sell-requests", "chat-photos", "dm-photos"];

/** Проверка реального содержимого файла (magic bytes): тип из браузера можно подделать. */
function matchesSignature(type: string, b: Uint8Array): boolean {
  const startsWith = (...bytes: number[]) => bytes.every((v, i) => b[i] === v);
  switch (type) {
    case "image/jpeg": return startsWith(0xff, 0xd8, 0xff);
    case "image/png": return startsWith(0x89, 0x50, 0x4e, 0x47);
    case "image/gif": return startsWith(0x47, 0x49, 0x46, 0x38);
    case "image/webp": return startsWith(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
    case "image/svg+xml": return true; // проверяется отдельно ниже, и только для админа
    default: return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const folder = formData.get("folder");
    const idToken = formData.get("idToken");

    if (!(file instanceof File)) return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
    if (typeof folder !== "string" || !folder) return NextResponse.json({ error: "Не указана папка загрузки" }, { status: 400 });
    if (typeof idToken !== "string" || !idToken) {
      return NextResponse.json({ error: "Нужно войти в аккаунт, чтобы загружать файлы" }, { status: 401 });
    }
    if (!(file.type in EXT_BY_TYPE)) {
      return NextResponse.json({ error: "Разрешены только изображения: JPG, PNG, WEBP, GIF" }, { status: 400 });
    }
    if (file.size > MAX_SIZE_BYTES) return NextResponse.json({ error: "Файл слишком большой (максимум 4 МБ)" }, { status: 400 });

    let uid: string;
    try {
      uid = (await adminAuth().verifyIdToken(idToken)).uid;
    } catch (err) {
      console.error("blob upload: не удалось проверить токен входа —", err);
      return NextResponse.json({ error: "Сессия истекла. Войди заново и попробуй снова." }, { status: 401 });
    }

    const admin = isAdminUid(uid);
    if (ADMIN_ONLY_FOLDERS.includes(folder)) {
      if (!admin) return NextResponse.json({ error: "Загружать сюда может только администратор." }, { status: 403 });
    } else if (!USER_FOLDERS.includes(folder)) {
      return NextResponse.json({ error: "Неизвестная папка загрузки" }, { status: 400 });
    }
    // SVG может содержать скрипты — обычным пользователям не разрешаем.
    if (file.type === "image/svg+xml" && !admin) {
      return NextResponse.json({ error: "SVG разрешён только администратору" }, { status: 400 });
    }

    if (!admin && !(await rateLimit(`upload_${uid}`, 40, 60 * 60_000))) {
      return NextResponse.json({ error: "Слишком много загрузок, попробуй позже" }, { status: 429 });
    }

    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (!matchesSignature(file.type, head)) {
      return NextResponse.json({ error: "Содержимое файла не похоже на изображение" }, { status: 400 });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error("blob upload: переменная BLOB_READ_WRITE_TOKEN не задана на сервере");
      return NextResponse.json({ error: "Хранилище файлов не настроено на сервере (нет BLOB_READ_WRITE_TOKEN)." }, { status: 500 });
    }

    const pathname = `${folder}/${Date.now()}_${randomBytes(6).toString("hex")}.${EXT_BY_TYPE[file.type]}`;
    const blob = await put(pathname, file, { access: "public", contentType: file.type });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    console.error("blob upload error:", err);
    return NextResponse.json({ error: "Не удалось загрузить файл. Подробности — в логах сервера (Vercel → Logs)." }, { status: 500 });
  }
}
