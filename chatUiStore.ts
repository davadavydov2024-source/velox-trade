"use client";

import { create } from "zustand";

interface ChatUiState {
  threadOpen: boolean;
  setThreadOpen: (open: boolean) => void;
}

// Живёт только в памяти вкладки (не persist) — просто отражает, открыт ли сейчас конкретный чат
// (не список) на странице /chats, чтобы MobileTabBar мог спрятаться и не перекрывать поле ввода
// сообщения нижней навигацией на телефонах (особенно на iPhone — там ещё и safe-area снизу).
export const useChatUi = create<ChatUiState>((set) => ({
  threadOpen: false,
  setThreadOpen: (open) => set({ threadOpen: open }),
}));
