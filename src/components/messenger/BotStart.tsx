"use client";

import { Avatar } from "./ui";
import type { MAccount } from "./mtypes";

/**
 * Как в Telegram: пока человек ни разу не писал боту, вместо поля ввода внизу — большая кнопка «Начать».
 * Нажал — в чат уходит «/start», и бот отвечает приветствием.
 */
export function BotStartBar({ onStart }: { onStart: () => void }) {
  return (
    <div className="mx-safe-bottom shrink-0" style={{ background: "var(--mx-bg)", borderTop: "1px solid var(--mx-line)" }}>
      <div className="px-4 pt-3 pb-3">
        <button
          onClick={onStart}
          className="mx-btn w-full h-12 flex items-center justify-center text-[16px] font-semibold active:scale-[0.98] transition-transform"
          style={{ background: "var(--mx-accent)", color: "var(--mx-accent-text, #fff)", borderRadius: 999 }}
        >
          Начать
        </button>
      </div>
    </div>
  );
}

/** Пустой чат с ботом: карточка «Что умеет этот бот?» с описанием, которое задал создатель. */
export function BotIntro({ bot, name, uid }: { bot: MAccount | null; name: string; uid: string }) {
  const about = bot?.bio?.trim();
  return (
    <div className="h-full flex items-center justify-center px-5">
      <div className="rounded-3xl px-5 py-5 flex flex-col items-center text-center w-full" style={{ background: "var(--mx-glass)", backdropFilter: "blur(14px)", maxWidth: 320 }}>
        <Avatar src={bot?.photoURL} name={name} seed={uid} size={72} />
        <p className="font-semibold text-[17px] mt-3 break-words max-w-full">{name}</p>
        {bot?.handle && <p className="mx-muted text-[13px]">@{bot.handle} · бот</p>}
        <div className="w-full mt-4 pt-3 text-left" style={{ borderTop: "1px solid var(--mx-line)" }}>
          <p className="text-[13px] font-semibold" style={{ color: "var(--mx-accent)" }}>Что умеет этот бот?</p>
          <p className="text-[14.5px] mt-1 whitespace-pre-wrap break-words leading-snug">{about || "Автор бота пока не добавил описание. Нажмите «Начать», чтобы бот поприветствовал вас."}</p>
        </div>
        <p className="mx-muted text-[12.5px] mt-3">Нажмите «Начать» внизу, чтобы запустить бота</p>
      </div>
    </div>
  );
}

/** Команды бота одной строкой над полем ввода: нажал — команда отправляется. */
export function BotCommandsRow({ commands, onPick }: { commands: string[]; onPick: (cmd: string) => void }) {
  return (
    <div className="shrink-0 flex gap-2 px-3 pt-2 pb-1 overflow-x-auto mx-noscrollbar" style={{ background: "var(--mx-bg)" }} aria-label="Команды бота">
      {commands.map((c) => (
        <button
          key={c}
          onClick={() => onPick(c)}
          className="mx-chip shrink-0 active:scale-95 transition-transform"
          style={{ height: 34, padding: "0 14px", background: "var(--mx-surface)", border: "1px solid var(--mx-line)", borderRadius: 999, color: "var(--mx-accent)", fontSize: 14, fontWeight: 500 }}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
