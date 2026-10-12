import { auth } from "@/lib/firebase";

/** fire-and-forget POST к нашему API с Firebase ID token. Без входа молча ничего не делает. */
export function postWithToken(url: string, body: unknown): void {
  (async () => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      keepalive: true,
    });
  })().catch(() => {});
}
