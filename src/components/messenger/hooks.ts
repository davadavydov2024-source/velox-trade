"use client";

import { applyKept } from "./ghost";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { mApi } from "./api";
import { MAccount, MChat, MFolder, MMessage, MStory, MUserChat } from "./mtypes";

export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Свой аккаунт мессенджера (live). account === null и loading === false — аккаунта ещё нет. */
export function useMyAccount(uid?: string | null) {
  const [account, setAccount] = useState<MAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!uid) {
      setAccount(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(
      doc(db, "messengerAccounts", uid),
      (snap) => {
        setError(null);
        setAccount(snap.exists() ? ({ uid, ...snap.data() } as MAccount) : null);
        setLoading(false);
      },
      (err) => {
        // Раньше ошибка (например permission-denied из-за правил Firestore) молча превращалась в «аккаунта нет»,
        // и после успешной регистрации человек снова видел форму. Теперь показываем причину.
        console.error("messengerAccounts read error:", err);
        setError((err as { code?: string })?.code || "unknown");
        setAccount(null);
        setLoading(false);
      }
    );
  }, [uid]);
  return { account, loading, error };
}

/** Один аккаунт с живым статусом «в сети» (для открытого чата). */
export function useLiveAccount(uid?: string | null): MAccount | null {
  const [acc, setAcc] = useState<MAccount | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  useEffect(() => {
    if (!uid) return setAcc(null);
    return onSnapshot(
      doc(db, "messengerAccounts", uid),
      (snap) => setAcc(snap.exists() ? ({ uid, ...snap.data() } as MAccount) : null),
      () => setAcc(null)
    );
  }, [uid]);
  // без useMemo новый объект на каждый рендер ломал бы мемоизацию пузырей в чате (accountsAll менялся бы всегда)
  return useMemo(() => withContactName(acc), [acc, contactsVersion]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useMyChats(uid?: string | null) {
  const [chats, setChats] = useState<MChat[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!uid) {
      setChats([]);
      setLoading(true);
      return;
    }
    // Без orderBy: array-contains + orderBy по другому полю требует составного индекса — сортируем на клиенте.
    const q = query(collection(db, "messengerChats"), where("members", "array-contains", uid));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MChat);
        list.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
        setChats(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [uid]);
  return { chats, loading };
}

export function useUserChats(uid?: string | null): Record<string, MUserChat> {
  const [map, setMap] = useState<Record<string, MUserChat>>({});
  useEffect(() => {
    if (!uid) {
      setMap({});
      return;
    }
    return onSnapshot(
      collection(db, "messengerUserChats", uid, "chats"),
      (snap) => {
        const next: Record<string, MUserChat> = {};
        snap.docs.forEach((d) => (next[d.id] = d.data() as MUserChat));
        setMap(next);
      },
      () => {}
    );
  }, [uid]);
  return map;
}

export function useFolders(uid?: string | null): MFolder[] {
  const [folders, setFolders] = useState<MFolder[]>([]);
  useEffect(() => {
    if (!uid) {
      setFolders([]);
      return;
    }
    return onSnapshot(
      collection(db, "messengerUserFolders", uid, "folders"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MFolder);
        list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setFolders(list);
      },
      () => {}
    );
  }, [uid]);
  return folders;
}

// ---- кэш аккаунтов (имена и фото для списка чатов, групп, реакций) ----
const accountCache = new Map<string, MAccount | null>();
const accountPending = new Set<string>();
let cacheVersion = 0;

// ---- мои имена для контактов (видны только мне, как «Изм.» в Telegram): подменяют displayName везде ----
const contactNames = new Map<string, string>();
let contactsVersion = 0;
const fullName = (first?: string, last?: string) => [first, last].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
function withContactName<T extends MAccount | null | undefined>(a: T): T {
  if (!a) return a;
  const n = contactNames.get(a.uid);
  return n && n !== a.displayName ? ({ ...a, displayName: n, originalName: a.displayName } as T) : a;
}
export async function reloadContactNames() {
  try {
    const r = await mApi<{ contacts?: Record<string, { firstName?: string; lastName?: string }> }>("contact");
    contactNames.clear();
    Object.entries(r.contacts ?? {}).forEach(([uid, c]) => {
      const n = fullName(c.firstName, c.lastName);
      if (n) contactNames.set(uid, n);
    });
    contactsVersion++;
    listeners.forEach((l) => l());
  } catch {
    // имена необязательны — без них показываем настоящие
  }
}
/** Сразу применить новое имя (после «Изм.»), не дожидаясь перезагрузки списка. */
export function setContactName(uid: string, firstName?: string, lastName?: string) {
  const n = fullName(firstName, lastName);
  if (n) contactNames.set(uid, n);
  else contactNames.delete(uid);
  contactsVersion++;
  listeners.forEach((l) => l());
}
/** Грузит мои имена контактов (при входе и при возвращении на вкладку). Вызывать один раз в корне мессенджера. */
export function useContactNames(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    reloadContactNames();
    const onVis = () => document.visibilityState === "visible" && reloadContactNames();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      contactNames.clear();
    };
  }, [enabled]);
}
const listeners = new Set<() => void>();

async function loadAccounts(uids: string[]) {
  const missing = uids.filter((u) => u && !accountCache.has(u) && !accountPending.has(u));
  if (missing.length === 0) return;
  missing.forEach((u) => accountPending.add(u));
  await Promise.all(
    missing.map(async (u) => {
      try {
        const snap = await getDoc(doc(db, "messengerAccounts", u));
        accountCache.set(u, snap.exists() ? ({ uid: u, ...snap.data() } as MAccount) : null);
      } catch {
        accountCache.set(u, null);
      } finally {
        accountPending.delete(u);
      }
    })
  );
  cacheVersion++;
  listeners.forEach((l) => l());
}

export function cacheAccounts(list: MAccount[]) {
  list.forEach((a) => accountCache.set(a.uid, a));
  cacheVersion++;
  listeners.forEach((l) => l());
}

export function useAccounts(uids: string[]): Record<string, MAccount | null> {
  const [, setTick] = useState(0);
  const key = uids.slice().sort().join(",");
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    loadAccounts(key ? key.split(",") : []);
    return () => {
      listeners.delete(l);
    };
  }, [key]);
  return useMemo(() => {
    const out: Record<string, MAccount | null> = {};
    uids.forEach((u) => (out[u] = withContactName(accountCache.get(u) ?? null)));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, cacheVersion, contactsVersion]);
}

export function useMessages(chatId: string | null, pageSize = 60, me?: string) {
  const [messages, setMessages] = useState<MMessage[]>([]);
  const [count, setCount] = useState(pageSize);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cache = useRef(new Map<string, { s: string; m: MMessage }>());
  const loadedCount = useRef(0); // сколько запрошено в последнем пришедшем снимке — пока count больше, догрузка уже идёт

  useEffect(() => {
    cache.current = new Map();
    loadedCount.current = 0;
    setMessages([]);
    setCount(pageSize);
    setLoading(true);
    setError(null);
  }, [chatId, pageSize]);

  useEffect(() => {
    if (!chatId) return;
    // просим на одно сообщение больше: так точно знаем, есть ли ещё история (раньше при ровно N сообщениях спиннер крутился вечно)
    const q = query(collection(db, "messengerChats", chatId, "messages"), orderBy("createdAt", "desc"), limit(count + 1));
    return onSnapshot(
      q,
      (snap) => {
        const store = cache.current;
        const build = (d: { id: string; data: () => unknown }) => {
          const fresh = { id: d.id, ...(d.data() as object) } as MMessage;
          const s = JSON.stringify(fresh);
          const prev = store.get(d.id);
          const entry = prev && prev.s === s ? prev : { s, m: fresh };
          store.set(d.id, entry);
          return entry;
        };
        // JSON.stringify только для изменившихся документов, а не для всей истории на каждый снимок
        snap.docChanges().forEach((ch) => (ch.type === "removed" ? store.delete(ch.doc.id) : build(ch.doc)));
        const docs = snap.docs.slice(0, count);
        const keep = new Set(docs.map((d) => d.id));
        const list = applyKept(chatId, me, docs.map((d) => (store.get(d.id) ?? build(d)).m).reverse());
        Array.from(store.keys()).forEach((k) => !keep.has(k) && store.delete(k));
        loadedCount.current = count;
        setMessages(list);
        setHasMore(snap.size > count);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error("messages read error:", err);
        setError((err as { code?: string })?.code || "unknown");
        setLoading(false);
      }
    );
  }, [chatId, count, attempt, me]);

  const loadMore = useCallback(() => {
    // не накручиваем страницы, пока предыдущая не загрузилась (onScroll стреляет десятки раз подряд)
    setCount((c) => (c > loadedCount.current && loadedCount.current > 0 ? c : c + pageSize));
  }, [pageSize]);
  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setAttempt((a) => a + 1);
  }, []);
  return { messages, loading, hasMore, loadMore, error, retry };
}

/** Активные истории от контактов (обновляются раз в минуту и по запросу). */
export function useStories(enabled: boolean) {
  const [stories, setStories] = useState<MStory[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const reload = useCallback(async () => {
    try {
      const res = await mApi<{ stories?: MStory[] }>("stories", undefined, "GET");
      setStories((res.stories ?? []).filter((s) => s.expiresAt > Date.now()));
    } catch {
      // истории необязательны — тихо игнорируем
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    reload();
    timer.current = setInterval(reload, 60_000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [enabled, reload]);
  return { stories, reload };
}

/** Высота видимой области: на iOS клавиатура уменьшает visualViewport, а не окно — без этого поле ввода уезжает.
 *  События visualViewport летят на каждом кадре анимации клавиатуры, поэтому обновляем раз в кадр и только при изменении. */
export function useViewportHeight(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    let raf = 0;
    let lastH = -1;
    let lastT = -1;
    const apply = () => {
      raf = 0;
      const h = Math.round(vv ? vv.height : window.innerHeight);
      const t = Math.round(vv?.offsetTop ?? 0);
      if (h !== lastH) {
        lastH = h;
        root.style.setProperty("--mx-vh", `${h}px`);
      }
      if (t !== lastT) {
        lastT = t;
        root.style.setProperty("--mx-vt", `${t}px`); // iOS сдвигает видимую область при клавиатуре — мессенджер едет за ней
      }
      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    vv?.addEventListener("resize", schedule);
    vv?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    // страница под мессенджером не должна скроллиться и «пружинить»
    const prev = { html: root.style.overflow, body: document.body.style.overflow, over: root.style.overscrollBehavior };
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    return () => {
      if (raf) cancelAnimationFrame(raf);
      vv?.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      root.style.removeProperty("--mx-vh");
      root.style.removeProperty("--mx-vt");
      root.style.overflow = prev.html;
      document.body.style.overflow = prev.body;
      root.style.overscrollBehavior = prev.over;
    };
  }, []);
}

function toMs(v: any): number {
  if (typeof v === "number") return v;
  if (v?.toMillis) return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  return 0;
}

/** Кто печатает: документы messengerChats/{id}/typing/{uid} с полем at; свежим считаем at не старше 5 с. */
export function useTyping(chatId: string | null, me: string): string[] {
  const [map, setMap] = useState<Record<string, number>>({});
  const [, force] = useState(0);
  useEffect(() => {
    setMap({});
    if (!chatId) return;
    return onSnapshot(
      collection(db, "messengerChats", chatId, "typing"),
      (snap) => {
        const next: Record<string, number> = {};
        snap.docs.forEach((d) => (next[d.id] = toMs(d.data()?.at)));
        setMap(next);
      },
      () => {}
    );
  }, [chatId]);
  const now = Date.now();
  const active = Object.entries(map).filter(([uid, at]) => uid !== me && now - at < 5000).map(([uid]) => uid);
  // один таймер на ближайшее «протухание» вместо перерисовки всего чата каждую секунду
  const activeKey = active.join(",");
  useEffect(() => {
    if (!activeKey) return;
    const soonest = Math.min(...Object.entries(map).filter(([uid]) => uid !== me).map(([, at]) => at + 5000).filter((t) => t > Date.now()));
    if (!isFinite(soonest)) return;
    const t = setTimeout(() => force((x) => x + 1), Math.max(50, soonest - Date.now() + 50));
    return () => clearTimeout(t);
  }, [activeKey, map, me]);
  return active;
}
