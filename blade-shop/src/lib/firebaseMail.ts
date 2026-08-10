import { collection, addDoc } from "firebase/firestore";
import { db } from "./firebase";

const mailCol = collection(db, "mail");

// Большинство SMTP-провайдеров (Gmail, Yandex, mail.ru и т.д.) ограничивают число адресов
// в одном письме — разбиваем рассылку на пачки, чтобы не упереться в этот лимит.
const CHUNK_SIZE = 40;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Рассылка через официальное расширение Firebase "Trigger Email from Firestore":
 * оно само следит за коллекцией "mail" и отправляет письма через настроенный тобой SMTP
 * (Firebase Console → Extensions → установить "Trigger Email from Firestore").
 * Получателей кладём в bcc, а не в to — иначе все увидят почту друг друга в письме.
 */
export async function queueBroadcastEmail(
  recipients: string[],
  subject: string,
  html: string
): Promise<{ batches: number }> {
  const batches = chunk(recipients.filter(Boolean), CHUNK_SIZE);
  for (const bcc of batches) {
    await addDoc(mailCol, {
      bcc,
      message: { subject, html },
      createdAt: Date.now(),
    });
  }
  return { batches: batches.length };
}

export function broadcastHtml(text: string, buttonText?: string, buttonLink?: string): string {
  const button =
    buttonText && buttonLink
      ? `<p style="margin-top:20px;"><a href="${buttonLink}" style="background:#6C5CE7;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;">${buttonText}</a></p>`
      : "";
  return `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#111;">${text.replace(/\n/g, "<br/>")}${button}</div>`;
}
