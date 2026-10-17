import { auth } from "./firebase";
import { getDeviceId } from "./sessions";

/**
 * Push-уведомления на стандартном Web Push (Push API + VAPID) — БЕЗ Firebase Messaging.
 * Браузер сам регистрируется в своём push-сервисе, а мы получаем подписку {endpoint, keys} и
 * сохраняем её на сервере (api/push/subscribe). Ограничения API-ключа Firebase, Installations API
 * и FCM Registration API больше ни на что не влияют.
 *
 * Нужны две переменные в Vercel: NEXT_PUBLIC_VAPID_PUBLIC_KEY (публичный, для браузера) и
 * VAPID_PRIVATE_KEY (секретный, только сервер). Сгенерировать пару: `node scripts/generate-vapid.js`.
 */
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

const PUSH_SW_URL = "/push-sw.js";
// Отдельный scope: общий /sw.js (PWA/кэш) живёт на "/", а на одном scope может быть только один SW.
const PUSH_SW_SCOPE = "/push-scope/";

/** Ошибка включения push с машинным кодом (message) и подробностями (detail). */
export class PushError extends Error {
  detail: string;
  constructor(code: string, detail = "") {
    super(code);
    this.detail = detail;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, code: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new PushError(code)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function base64UrlToBytes(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function getPushPermissionState(): Promise<NotificationPermission | "unsupported"> {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

async function getPushRegistration(): Promise<ServiceWorkerRegistration> {
  // Файл воркера должен реально отдаваться сайтом (public/push-sw.js) — проверяем заранее и говорим прямо.
  const probe = await fetch(PUSH_SW_URL, { cache: "no-store" }).catch(() => null);
  if (!probe || !probe.ok) throw new PushError("sw-missing", probe ? `HTTP ${probe.status}` : "нет ответа");

  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register(PUSH_SW_URL, { scope: PUSH_SW_SCOPE, updateViaCache: "none" });
  } catch (e: any) {
    throw new PushError("sw-register-failed", String(e?.message || e).slice(0, 160));
  }
  if (!registration.active) {
    const worker = registration.installing || registration.waiting;
    if (worker) {
      await new Promise<void>((resolve) => {
        if (worker.state === "activated") return resolve();
        worker.addEventListener("statechange", () => worker.state === "activated" && resolve());
        setTimeout(resolve, 8000); // страховка
      });
    }
  }
  return registration;
}

async function saveSubscriptionOnServer(sub: PushSubscription) {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("not-signed-in");
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ subscription: sub.toJSON(), deviceId: getDeviceId() }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new PushError("save-failed", data?.error || `HTTP ${res.status}`);
  }
}

/** Получает (или создаёт) подписку браузера. Если разрешение уже дано — окон не показывает. */
async function ensureBrowserSubscription(registration: ServiceWorkerRegistration): Promise<PushSubscription> {
  if (!VAPID_PUBLIC) throw new PushError("vapid-not-configured");
  const key = base64UrlToBytes(VAPID_PUBLIC);

  let sub = await registration.pushManager.getSubscription();
  // Подписка с другим ключом (например, от прошлой настройки) не подойдёт — пересоздаём.
  if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  if (!sub) {
    try {
      sub = await withTimeout(
        registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource }),
        20000,
        "subscribe-timeout"
      );
    } catch (e: any) {
      if (e instanceof PushError) throw e;
      throw new PushError("subscribe-failed", `${e?.name ?? ""} ${e?.message ?? e}`.trim().slice(0, 300));
    }
  }
  return sub;
}

/** Есть ли у ЭТОГО браузера действующая подписка (разрешение дано и подписка создана). */
export async function hasActiveSubscription(_uid?: string): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration(PUSH_SW_SCOPE);
    return !!(await reg?.pushManager.getSubscription());
  } catch {
    return false;
  }
}

export async function subscribeToPush(_uid?: string): Promise<void> {
  if (!isPushSupported()) throw new PushError("push-unsupported");
  if (!VAPID_PUBLIC) throw new PushError("vapid-not-configured");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new PushError("permission-denied");

  const registration = await getPushRegistration();
  const sub = await ensureBrowserSubscription(registration);
  await saveSubscriptionOnServer(sub);
}

/**
 * Гарантирует, что ЭТО устройство подписано и записано на сервере, и возвращает его endpoint.
 * Бросает PushError с причиной, если не получилось (в отличие от тихой синхронизации).
 * Используется кнопкой «Тест»: раньше она могла отправить уведомление только на уже сохранённые
 * устройства и молча пропустить текущее, если его запись потерялась.
 */
export async function ensureCurrentDeviceSubscribed(): Promise<string> {
  if (!isPushSupported()) throw new PushError("push-unsupported");
  if (Notification.permission !== "granted") throw new PushError("permission-denied");
  const registration = await getPushRegistration();
  const sub = await ensureBrowserSubscription(registration);
  await saveSubscriptionOnServer(sub);
  return sub.endpoint;
}

/**
 * Тихая синхронизация при входе: если разрешение уже дано, (пере)сохраняем подписку на сервере.
 * Лечит смену аккаунта на том же браузере и подписки, потерянные при переезде с Firebase.
 * Окон и запросов разрешения не показывает.
 */
export async function syncPushSubscriptionSilently(): Promise<void> {
  if (!isPushSupported() || Notification.permission !== "granted" || !VAPID_PUBLIC) return;
  try {
    const registration = await getPushRegistration();
    const sub = await ensureBrowserSubscription(registration);
    await saveSubscriptionOnServer(sub);
  } catch {
    // тихо: это фоновая синхронизация
  }
}

export async function unsubscribeFromPush(_uid?: string): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration(PUSH_SW_SCOPE);
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  const idToken = await auth.currentUser?.getIdToken();
  if (idToken) {
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ endpoint }),
    }).catch(() => {});
  }
}

/** Понятный текст для ошибки включения push (общий для карточки в профиле и всплывающего окна). */
export function describePushError(err: any): { level: "warning" | "error"; text: string } {
  const code = err?.message as string | undefined;
  const detail = err?.detail ? ` (${err.detail})` : "";
  switch (code) {
    case "permission-denied":
      return { level: "warning", text: "Разрешение на уведомления не дано — включи его в настройках браузера для этого сайта" };
    case "push-unsupported":
      return { level: "warning", text: "Этот браузер не поддерживает push. На iPhone добавь сайт на главный экран («Поделиться» → «На экран Домой») и включи уведомления оттуда" };
    case "vapid-not-configured":
      return { level: "error", text: "На сайте не заданы VAPID-ключи: добавь NEXT_PUBLIC_VAPID_PUBLIC_KEY и VAPID_PRIVATE_KEY в Vercel (пара генерируется командой node scripts/generate-vapid.js) и сделай redeploy" };
    case "sw-missing":
      return { level: "error", text: `Не найден файл /push-sw.js на сайте${detail}. Положи его в папку public и задеплой` };
    case "sw-register-failed":
      return { level: "error", text: `Браузер не смог запустить service worker${detail}` };
    case "subscribe-timeout":
      return { level: "error", text: "Push-сервис браузера не отвечает — возможно, он недоступен в твоей сети. Попробуй другую сеть или VPN" };
    case "subscribe-failed":
      return { level: "error", text: `Браузер не смог оформить подписку${detail}. Если ошибка про «push service error» — push-сервис браузера недоступен в твоей сети; попробуй Chrome/Edge или другую сеть` };
    case "save-failed":
      return { level: "error", text: `Подписка создана, но сервер не сохранил её${detail}` };
    default:
      return { level: "error", text: `Не удалось включить уведомления${code ? `: ${String(code).slice(0, 120)}` : ""}` };
  }
}
