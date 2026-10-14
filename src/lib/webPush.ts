import { collection, query, where, getDocs, deleteDoc } from "firebase/firestore";
import { db, auth, activeApp, firebaseConfig } from "./firebase";

// VAPID-ключ НЕОБЯЗАТЕЛЕН: без него Firebase SDK использует свой ключ по умолчанию, и push работает
// «из коробки» с подключённым Firebase Messaging. Если переменная всё же задана — пробуем с ней, а
// при неудаче (например, ключ от другого проекта) автоматически повторяем без ключа.
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_FCM_VAPID_KEY || undefined;

// У сайта два service worker'а: общий /sw.js (кэш/PWA, scope "/") и этот — для push. Раньше оба
// регистрировались на scope "/", а на одном scope живёт только один SW: каждая регистрация
// вытесняла предыдущую, и в итоге push приходил в SW, который его не обрабатывает. Поэтому push-SW
// получает СВОЙ scope и явно передаётся в getToken.
const PUSH_SW_URL = "/firebase-messaging-sw.js";
const PUSH_SW_SCOPE = "/firebase-cloud-messaging-push-scope";

/** Ошибка включения push с машинным кодом (message) и подробностями (detail) — чтобы интерфейс
 * показал, ЧТО именно сломалось, а не общее «не удалось». */
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

async function requestToken(messaging: import("firebase/messaging").Messaging, registration: ServiceWorkerRegistration): Promise<string | null> {
  const { getToken } = await import("firebase/messaging");
  const attempt = (vapidKey?: string) =>
    withTimeout(
      getToken(messaging, { ...(vapidKey ? { vapidKey } : {}), serviceWorkerRegistration: registration }),
      20000,
      "token-timeout"
    );
  if (VAPID_PUBLIC) {
    try {
      return await attempt(VAPID_PUBLIC);
    } catch (e) {
      if (e instanceof PushError) throw e; // таймаут — повтор не поможет
      // иначе — ключ не подошёл; пробуем со встроенным ключом Firebase
    }
  }
  return attempt();
}

async function getMessagingSafe() {
  if (typeof window === "undefined") return null;
  const { isSupported, getMessaging } = await import("firebase/messaging");
  if (!(await isSupported())) return null; // Safari вне PWA на iOS и т.п.
  // Файл воркера должен реально отдаваться сайтом (public/firebase-messaging-sw.js) — иначе
  // регистрация падает с невнятной ошибкой. Проверяем заранее и говорим прямо.
  const probe = await fetch(PUSH_SW_URL, { cache: "no-store" }).catch(() => null);
  if (!probe || !probe.ok) throw new PushError("sw-missing", probe ? `HTTP ${probe.status}` : "нет ответа");
  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register(PUSH_SW_URL, { scope: PUSH_SW_SCOPE, updateViaCache: "none" });
  } catch (e: any) {
    throw new PushError("sw-register-failed", String(e?.message || e).slice(0, 160));
  }
  // Ждём именно ЭТОТ SW, а не navigator.serviceWorker.ready (оно относится к основному scope "/").
  if (!registration.active) {
    const worker = registration.installing || registration.waiting;
    if (worker) {
      await new Promise<void>((resolve) => {
        if (worker.state === "activated") return resolve();
        worker.addEventListener("statechange", () => worker.state === "activated" && resolve());
        setTimeout(resolve, 8000); // страховка, чтобы не зависнуть навсегда
      });
    }
  }
  return { messaging: getMessaging(activeApp), registration };
}

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "Notification" in window;
}

export async function getPushPermissionState(): Promise<NotificationPermission | "unsupported"> {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

/** Тихое получение токена (без запроса разрешения) — любые сбои дают null, а не исключение. */
async function fetchToken(): Promise<string | null> {
  try {
    const ctx = await getMessagingSafe();
    if (!ctx) return null;
    return await requestToken(ctx.messaging, ctx.registration);
  } catch {
    return null;
  }
}

async function saveTokenOnServer(token: string) {
  // Через сервер: он убирает дубли и отвязывает токен от прежнего аккаунта на этом устройстве.
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("not-signed-in");
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error("subscribe-failed");
}

/** Проверяет, есть ли у ЭТОГО браузера уже сохранённый FCM-токен для юзера. */
export async function hasActiveSubscription(uid: string): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== "granted") return false;
  const token = await fetchToken();
  if (!token) return false;
  const snap = await getDocs(query(collection(db, "pushSubscriptions"), where("uid", "==", uid), where("token", "==", token)));
  return !snap.empty;
}

export async function subscribeToPush(uid: string): Promise<void> {
  const ctx = await getMessagingSafe();
  if (!ctx) throw new PushError("push-unsupported");
  // Для getToken нужны ВСЕ четыре значения конфигурации. Если в Vercel не задана хоть одна из
  // NEXT_PUBLIC_FIREBASE_* переменных, SDK падает с невнятной ошибкой — проверяем заранее.
  const missing = (["apiKey", "projectId", "messagingSenderId", "appId"] as const).filter((k) => !firebaseConfig[k]);
  if (missing.length) throw new PushError("config-missing", missing.join(", "));

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("permission-denied");

  let token: string | null = null;
  try {
    // Внутри — таймаут 20 с: если серверы Google (FCM) недоступны из сети пользователя, getToken иначе висит вечно.
    token = await requestToken(ctx.messaging, ctx.registration);
  } catch (e: any) {
    if (e instanceof PushError) throw e;
    console.error("FCM getToken failed:", e?.code, e?.message, e);
    throw new PushError("token-failed", `${e?.code ?? ""} ${e?.message ?? e}`.trim().slice(0, 400));
  }
  if (!token) throw new PushError("token-failed", "пустой токен");
  try {
    await saveTokenOnServer(token);
  } catch (e: any) {
    throw new PushError("save-failed", String(e?.message || e).slice(0, 160));
  }
  void uid;
}

/**
 * Тихая синхронизация: если разрешение на уведомления уже дано, получаем актуальный токен и
 * (пере)сохраняем его на сервере. Лечит три случая: токен сменился (FCM их периодически
 * обновляет), токен остался от старой регистрации SW (до исправления scope), и вход в другой
 * аккаунт на том же браузере. Окон и запросов разрешения не показывает.
 */
export async function syncPushSubscriptionSilently(): Promise<void> {
  if (!isPushSupported() || Notification.permission !== "granted") return;
  const token = await fetchToken();
  if (token) await saveTokenOnServer(token);
}

export async function unsubscribeFromPush(uid: string): Promise<void> {
  const ctx = await getMessagingSafe();
  if (!ctx) return;
  const { deleteToken } = await import("firebase/messaging");
  const token = await requestToken(ctx.messaging, ctx.registration).catch(() => null);
  if (token) {
    await deleteToken(ctx.messaging).catch(() => {});
    const snap = await getDocs(query(collection(db, "pushSubscriptions"), where("uid", "==", uid), where("token", "==", token)));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  }
}

/** Понятный человеку текст для ошибки включения push (общий для карточки в профиле и всплывающего окна). */
export function describePushError(err: any): { level: "warning" | "error"; text: string } {
  const code = err?.message as string | undefined;
  const detail = err?.detail ? ` (${err.detail})` : "";
  switch (code) {
    case "permission-denied":
      return { level: "warning", text: "Разрешение на уведомления не дано — включи его в настройках браузера для этого сайта" };
    case "push-unsupported":
      return { level: "warning", text: "Этот браузер не поддерживает push. На iPhone добавь сайт на главный экран («Поделиться» → «На экран Домой») и включи уведомления оттуда" };
    case "sw-missing":
      return { level: "error", text: `Не найден файл /firebase-messaging-sw.js на сайте${detail}. Положи его в папку public и задеплой` };
    case "sw-register-failed":
      return { level: "error", text: `Браузер не смог запустить service worker${detail}` };
    case "token-timeout":
      return { level: "error", text: "Серверы Google (FCM) не отвечают — похоже, они недоступны в твоей сети. Попробуй с VPN или с другой сети" };
    case "config-missing":
      return { level: "error", text: `В Vercel не заданы переменные Firebase: ${err.detail}. Добавь NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID и NEXT_PUBLIC_FIREBASE_APP_ID (Firebase Console → Project settings → Your apps) и сделай redeploy` };
    case "token-failed": {
      const d = String(err?.detail ?? "");
      if (/missing-app-config|appId|messagingSenderId/i.test(d))
        return { level: "error", text: "Не хватает настроек Firebase: проверь NEXT_PUBLIC_FIREBASE_APP_ID и NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID в Vercel" };
      if (/403|blocked|API key|PERMISSION_DENIED|not valid|restrict/i.test(d))
        return { level: "error", text: "Google отклонил запрос из-за ограничений API-ключа. В Google Cloud Console → APIs & Services → Credentials → «Browser key» открой API restrictions и добавь «Firebase Installations API» и «Firebase Cloud Messaging Registration API» (или выбери «Don't restrict key»)" };
      if (/push service error|AbortError/i.test(d))
        return { level: "error", text: "Браузер не смог зарегистрироваться в push-сервисе (чаще всего из-за недоступности серверов Google). Попробуй Chrome или Edge, VPN или другую сеть" };
      if (/permission-blocked/i.test(d))
        return { level: "warning", text: "Уведомления заблокированы в настройках браузера для этого сайта — разреши их и попробуй снова" };
      return { level: "error", text: `Не удалось получить токен уведомлений: ${d.slice(0, 200)}` };
    }
    case "save-failed":
      return { level: "error", text: `Токен получен, но сервер не сохранил подписку${detail}` };
    default:
      return { level: "error", text: `Не удалось включить уведомления${code ? `: ${String(code).slice(0, 120)}` : ""}` };
  }
}
