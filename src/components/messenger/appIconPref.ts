/** Иконка приложения, которую пользователь выбрал на этом устройстве (хранится в localStorage). */
export const USER_ICON_STYLES = [
  { id: "classic", label: "Классика" },
  { id: "ocean", label: "Океан" },
  { id: "dark", label: "Тёмная" },
  { id: "mint", label: "Мята" },
  { id: "violet", label: "Фиолет" },
  { id: "sunset", label: "Закат" },
  { id: "night", label: "Ночь" },
  { id: "sakura", label: "Сакура" },
  { id: "gold", label: "Золото" },
  { id: "minimal", label: "Минимал" },
  { id: "telegram", label: "Лазурь" },
  { id: "neon", label: "Неон" },
  { id: "crimson", label: "Рубин" },
  { id: "forest", label: "Лес" },
] as const;

const KEY = "mx-app-icon";

export const isUserIcon = (v: unknown): v is string => USER_ICON_STYLES.some((s) => s.id === v);

export function getSavedIcon(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return isUserIcon(v) ? v : null;
  } catch {
    return null;
  }
}

function setLink(rel: string, href: string, sizes?: string) {
  let l = document.head.querySelector<HTMLLinkElement>(sizes ? `link[rel="${rel}"][sizes="${sizes}"]` : `link[rel="${rel}"]`);
  if (!l) {
    l = document.createElement("link");
    l.rel = rel;
    if (sizes) l.setAttribute("sizes", sizes);
    document.head.appendChild(l);
  }
  l.href = href;
}

/** Подменяет манифест и иконки страницы на выбранные — Chrome берёт их при «Установить приложение / На главный экран». */
export function applyIcon(id: string, save = true) {
  if (!isUserIcon(id)) return;
  if (save) {
    try { localStorage.setItem(KEY, id); } catch {}
  }
  setLink("manifest", `/api/miligram/manifest?icon=${id}`);
  setLink("apple-touch-icon", `/miligram/styles/${id}-180.png`);
  setLink("icon", `/miligram/styles/${id}-192.png`);
}

/** Событие установки Chrome/Android — ловим рано, показываем кнопку позже. */
type InstallEvt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: InstallEvt | null = null;
export const getInstallPrompt = () => deferred;
export function listenInstall() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvt;
  });
  window.addEventListener("appinstalled", () => { deferred = null; });
}
