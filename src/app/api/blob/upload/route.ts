import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 МБ

// Эти папки может загружать только админ — там лежат изображения товаров/игр/рекламы,
// которые видит весь сайт. "avatars" может загружать любой залогиненный пользователь.
const ADMIN_ONLY_FOLDERS = ["products", "games", "ads", "broadcasts"];

function isAdminUid(uid: string): boolean {
  const list = (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(uid);
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const folder = pathname.split("/")[0];
        let idToken: string | undefined;
        try {
          idToken = clientPayload ? JSON.parse(clientPayload).idToken : undefined;
        } catch {
          idToken = undefined;
        }

        if (!idToken) {
          throw new Error("Не авторизован");
        }

        const auth = adminAuth();
        const decoded = await auth.verifyIdToken(idToken);

        if (ADMIN_ONLY_FOLDERS.includes(folder) && !isAdminUid(decoded.uid)) {
          throw new Error("Доступ только для администраторов");
        }
        // Для остальных папок (avatars) достаточно быть залогиненным — decoded уже это подтверждает.

        return {
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: MAX_SIZE_BYTES,
        };
      },
      onUploadCompleted: async () => {
        // Ничего дополнительно делать не нужно — ссылку на файл клиент получает напрямую в ответе upload().
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
