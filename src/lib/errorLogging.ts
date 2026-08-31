import { collection, addDoc } from "firebase/firestore";
import { db } from "./firebase";

const errorsCol = collection(db, "clientErrors");

// Не даём одному и тому же цикличному багу засыпать Firestore тысячами одинаковых записей за
// секунду — простой троттлинг по сообщению об ошибке в рамках одной вкладки.
const recentlyLogged = new Map<string, number>();
const THROTTLE_MS = 10000;

async function logClientError(message: string, stack: string | undefined, source: string) {
  const key = `${source}:${message}`.slice(0, 200);
  const last = recentlyLogged.get(key);
  if (last && Date.now() - last < THROTTLE_MS) return;
  recentlyLogged.set(key, Date.now());

  try {
    await addDoc(errorsCol, {
      message: message.slice(0, 2000),
      stack: (stack ?? "").slice(0, 4000),
      source,
      url: window.location.href,
      userAgent: navigator.userAgent,
      createdAt: Date.now(),
    });
  } catch {
    // Если сама запись ошибки не удалась (например, оффлайн) — тут больше ничего не поделать,
    // не зацикливаем логирование логирования.
  }
}

/** Вешает глобальные перехватчики ошибок один раз за сессию вкладки — вызывается из
 * providers.tsx. Ловит необработанные исключения и необработанные промисы (самый частый
 * источник багов вида "тут просто ничего не произошло"). */
export function initErrorLogging() {
  if (typeof window === "undefined") return;
  if ((window as any).__errorLoggingInit) return;
  (window as any).__errorLoggingInit = true;

  window.addEventListener("error", (event) => {
    logClientError(event.message, event.error?.stack, "window.onerror");
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    logClientError(message, stack, "unhandledrejection");
  });
}
