"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MMessage } from "./mtypes";

/**
 * «Режим призрака» и сохранение удалённых сообщений — настройки этого устройства (как в OtherGram).
 * Собеседник не видит прочтение, «печатает…», «в сети» и просмотр истории; у вас на экране всё работает как обычно.
 */
interface GhostState {
  noRead: boolean;
  noTyping: boolean;
  hideOnline: boolean;
  quietStories: boolean;
  keepDeleted: boolean;
  set: (k: "noRead" | "noTyping" | "hideOnline" | "quietStories" | "keepDeleted", v: boolean) => void;
  reset: () => void;
}

export const useGhost = create<GhostState>()(
  persist(
    (set) => ({
      noRead: false, noTyping: false, hideOnline: false, quietStories: false, keepDeleted: false,
      set: (k, v) => set({ [k]: v } as Partial<GhostState>),
      reset: () => set({ noRead: false, noTyping: false, hideOnline: false, quietStories: false, keepDeleted: false }),
    }),
    { name: "mx-ghost" }
  )
);

export const ghostNow = () => useGhost.getState();

/* ───────── Копии сообщений, чтобы показать удалённое собеседником ───────── */

interface KeptEntry { m: MMessage; d?: number; r?: 1 } // d — когда заметили удаление, r — пометку «удалено» сбросили
const KEEP_PREFIX = "mx-kept-";
const KEEP_LIMIT = 400;

const load = (chatId: string): Record<string, KeptEntry> => {
  try { return JSON.parse(localStorage.getItem(KEEP_PREFIX + chatId) || "{}"); } catch { return {}; }
};
const save = (chatId: string, data: Record<string, KeptEntry>) => {
  try {
    const keys = Object.keys(data);
    if (keys.length > KEEP_LIMIT) keys.sort((a, b) => (data[a].m.createdAt ?? 0) - (data[b].m.createdAt ?? 0)).slice(0, keys.length - KEEP_LIMIT).forEach((k) => delete data[k]);
    localStorage.setItem(KEEP_PREFIX + chatId, JSON.stringify(data));
  } catch {}
};

export type KeptMessage = MMessage & { keptDeletedAt?: number };

/** Запоминает живые сообщения собеседников и подставляет сохранённый текст вместо «Сообщение удалено». */
export function applyKept(chatId: string, me: string | undefined, list: MMessage[]): KeptMessage[] {
  if (!ghostNow().keepDeleted || typeof localStorage === "undefined") return list;
  const data = load(chatId);
  let dirty = false;
  const out = list.map((m) => {
    const mineMsg = !!me && m.from === me;
    if (!m.deletedForAll) {
      if (!mineMsg && m.kind !== "system") {
        const prev = data[m.id];
        if (!prev || prev.m.text !== m.text || prev.m.mediaUrl !== m.mediaUrl) { data[m.id] = { m, ...(prev?.d ? { d: prev.d } : {}), ...(prev?.r ? { r: 1 as const } : {}) }; dirty = true; }
      }
      return m;
    }
    const e = data[m.id];
    if (!e || mineMsg) return m;
    if (!e.d) { e.d = Date.now(); dirty = true; }
    return { ...e.m, deletedForAll: false, reactions: {}, keptDeletedAt: e.r ? undefined : e.d } as KeptMessage;
  });
  if (dirty) save(chatId, data);
  return out;
}

/** «Сбросить пометки «удалено»»: сообщения остаются, подпись пропадает. */
export function resetDeletedMarks(): number {
  let n = 0;
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(KEEP_PREFIX)).forEach((k) => {
      const data = load(k.slice(KEEP_PREFIX.length));
      Object.values(data).forEach((e) => { if (e.d && !e.r) { e.r = 1; n++; } });
      localStorage.setItem(k, JSON.stringify(data));
    });
  } catch {}
  return n;
}

/* ───────── Экспорт / импорт настроек ───────── */

const SETTINGS_KEYS = ["mx-prefs", "mx-ghost", "mx-adv"];

export function exportSettings(): string {
  const out: Record<string, string> = {};
  SETTINGS_KEYS.forEach((k) => { const v = localStorage.getItem(k); if (v) out[k] = v; });
  return JSON.stringify({ app: "miligram", v: 1, settings: out }, null, 2);
}

export function importSettings(text: string): boolean {
  try {
    const j = JSON.parse(text);
    if (j?.app !== "miligram" || typeof j.settings !== "object") return false;
    Object.entries(j.settings as Record<string, string>).forEach(([k, v]) => { if (SETTINGS_KEYS.includes(k) && typeof v === "string") localStorage.setItem(k, v); });
    return true;
  } catch { return false; }
}

export function resetAllSettings() {
  SETTINGS_KEYS.forEach((k) => localStorage.removeItem(k));
}
