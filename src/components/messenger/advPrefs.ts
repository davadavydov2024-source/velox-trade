"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AvatarShape = "circle" | "squircle" | "square";

/** Расширенное оформление (аватарки, типографика, чаты) — настройки этого устройства. */
interface AdvState {
  avatarShape: AvatarShape;
  bubbleRadius: number; // 6–26 px
  lineHeight: number; // 1.15–1.6
  boldNames: boolean;
  denseChats: boolean; // компактный список чатов
  hideChatPreview: boolean; // не показывать текст последнего сообщения в списке
  set: <K extends keyof Omit<AdvState, "set" | "reset">>(k: K, v: AdvState[K]) => void;
  reset: () => void;
}

const DEFAULTS = { avatarShape: "circle" as AvatarShape, bubbleRadius: 18, lineHeight: 1.32, boldNames: false, denseChats: false, hideChatPreview: false };

export const useAdv = create<AdvState>()(
  persist(
    (set) => ({ ...DEFAULTS, set: (k, v) => set({ [k]: v } as Partial<AdvState>), reset: () => set({ ...DEFAULTS }) }),
    { name: "mx-adv" }
  )
);
