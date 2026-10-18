import { auth } from "./firebase";

/** fetch с токеном текущего пользователя в Authorization — для серверных маршрутов, требующих входа. */
export async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const idToken = await auth.currentUser?.getIdToken();
  return fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}), ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
  });
}
