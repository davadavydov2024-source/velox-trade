"use client";

import { useCallback, useEffect, useState } from "react";
import { mApi, MApiError } from "./api";
import type { MChat } from "./mtypes";

/**
 * «Удалить чат у меня» живёт на этом устройстве: чат прячется из списка, а старые сообщения не показываются
 * (как «очистить историю»). Новое сообщение возвращает чат в список. Дополнительно просим сервер очистить
 * историю (clearedAt) — если он это умеет, это работает и на других устройствах.
 */
type HiddenMap = Record<string, { at: number; hide: boolean }>;
const key = (uid: string) => `vc-hidden-chats-${uid}`;

export function useHiddenChats(uid: string | null) {
  const [map, setMap] = useState<HiddenMap>({});

  useEffect(() => {
    if (!uid) return;
    try {
      setMap(JSON.parse(localStorage.getItem(key(uid)) ?? "{}"));
    } catch {
      setMap({});
    }
  }, [uid]);

  const save = useCallback(
    (next: HiddenMap) => {
      setMap(next);
      if (!uid) return;
      try {
        localStorage.setItem(key(uid), JSON.stringify(next));
      } catch {}
    },
    [uid]
  );

  const hideChat = useCallback((chatId: string) => save({ ...map, [chatId]: { at: Date.now(), hide: true } }), [map, save]);
  /** Человек сам открыл чат (поиск, контакты): возвращаем в список, но старая история остаётся скрытой. */
  const revealChat = useCallback(
    (chatId: string) => {
      const cur = map[chatId];
      if (cur?.hide) save({ ...map, [chatId]: { ...cur, hide: false } });
    },
    [map, save]
  );

  /** Виден ли чат в списке с учётом локального удаления. */
  const isVisible = useCallback(
    (c: MChat) => {
      const h = map[c.id];
      return !h?.hide || (c.lastMessage?.at ?? 0) > h.at;
    },
    [map]
  );

  return { hiddenAt: (id: string) => map[id]?.at ?? 0, hideChat, revealChat, isVisible };
}

export interface DeleteResult {
  ok: boolean;
  message?: string;
}

/** Попросить сервер очистить историю у меня (не критично, ошибки игнорируем). */
export async function tryClearHistory(chatId: string): Promise<void> {
  try {
    await mApi("chat-settings", { chatId, clearHistory: true });
  } catch {
    // сервер может не поддерживать — локальное скрытие всё равно сработает
  }
}

/**
 * Удалить чат у всех: POST /api/messenger/delete-chat { chatId, forAll: true }.
 * Личный чат — исчезает у обоих; группа/канал — только владелец. Если на сервере такого роута нет (404) — понятная ошибка.
 */
export async function deleteChatForAll(chatId: string): Promise<DeleteResult> {
  try {
    await mApi("delete-chat", { chatId, forAll: true });
    return { ok: true };
  } catch (err) {
    if (err instanceof MApiError) {
      if (err.status === 404 || err.status === 405) return { ok: false, message: "Сервер пока не умеет удалять чат у всех. Удали у себя." };
      return { ok: false, message: err.message };
    }
    return { ok: false, message: "Не удалось удалить чат" };
  }
}

export async function leaveChatRequest(chatId: string, me: string): Promise<DeleteResult> {
  try {
    await mApi("chats/members", { chatId, remove: [me] });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof MApiError ? err.message : "Не удалось выйти" };
  }
}
