import html
import json
import logging
import time
from datetime import datetime

from .. import config, db
from ..registry import command, TIERS

log = logging.getLogger(__name__)
KINDS = ("photo", "video", "voice", "video_note", "audio", "animation", "sticker", "document")
NO_CAPTION = {"video_note", "sticker"}


async def enabled(owner_id: int) -> bool:
    """Сохранение включено по умолчанию для всех тарифов, включая FREE (выключается /stopsave)."""
    return await db.get_s(owner_id, "save", "1") == "1"


def _extract(m):
    for k in KINDS:
        v = getattr(m, k, None)
        if v:
            return k, (v[-1].file_id if k == "photo" else v.file_id)
    return "text", ""


def _t(ts) -> str:
    return datetime.fromtimestamp(float(ts), config.MSK).strftime("%d.%m %H:%M")


def _who(row) -> str:
    name = html.escape(row["from_name"] or "—")
    un = row["username"]
    return f"👤 <b>{name}</b> ({'@' + html.escape(un) if un else 'без username'} · <code>{row['from_id']}</code>)"


def _quote(text, limit=1500) -> str:
    text = text or ""
    if not text:
        return "<i>(без текста)</i>"
    return f"<blockquote>{html.escape(text[:limit])}{'…' if len(text) > limit else ''}</blockquote>"


def row_from_message(m) -> dict:
    fu = m.from_user
    kind, fid = _extract(m)
    return {
        "from_id": fu.id if fu else 0, "from_name": m.chat.full_name or (fu.full_name if fu else ""),
        "username": (fu.username if fu else "") or "", "kind": kind, "file_id": fid,
        "text": m.text or m.caption or "", "ts": m.date.timestamp() if m.date else time.time(), "hist": "[]",
    }


async def remember(m, conn_id: str, edited: bool = False):
    """Запомнить сообщение собеседника: текст, file_id (файлы не скачиваются) и историю правок."""
    if m.has_protected_content:  # отправитель запретил сохранение — уважаем
        return
    r = row_from_message(m)
    if not r["text"] and not r["file_id"]:
        return
    old = await get(conn_id, m.chat.id, m.message_id)
    hist = json.loads(old["hist"] or "[]") if old else []
    if old and edited and (old["text"] or "") != r["text"]:
        hist = (hist + [old["text"] or ""])[-10:]
    await db.execute(
        "INSERT OR REPLACE INTO saved(conn_id,chat_id,message_id,from_id,from_name,kind,text,file_id,ts,username,hist) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (conn_id, m.chat.id, m.message_id, r["from_id"], r["from_name"], r["kind"], r["text"], r["file_id"],
         old["ts"] if old else r["ts"], r["username"], json.dumps(hist, ensure_ascii=False)),
    )


async def get(conn_id, chat_id, message_id):
    return await db.fetchone("SELECT * FROM saved WHERE conn_id=? AND chat_id=? AND message_id=?", (conn_id, chat_id, message_id))


async def mark_fail(owner_id: int, e: Exception):
    log.warning("не удалось отправить уведомление %s: %s", owner_id, e)
    await db.set_s(owner_id, "save_err", f"{type(e).__name__}: {e}"[:200])


async def _send(bot, owner_id, text, kind="text", fid=""):
    if kind == "text" or not fid:
        return await bot.send_message(owner_id, text[:4000])
    send = getattr(bot, f"send_{kind}")
    try:
        if kind in NO_CAPTION:
            await bot.send_message(owner_id, text[:4000])
            await send(owner_id, fid)
        else:
            await send(owner_id, fid, caption=text[:1000])
    except Exception as e:
        if "chat not found" in str(e).lower() or "forbidden" in str(e).lower():
            raise
        await bot.send_message(owner_id, text[:3900] + "\n<i>(файл больше недоступен)</i>")


async def notify_deleted(bot, owner_id, row):
    head = f"🗑 <b>Сообщение удалено для всех</b>\n{_who(row)}\n🕒 отправлено {_t(row['ts'])} · удалено {_t(time.time())}"
    hist = json.loads(row["hist"] or "[]")
    hist_txt = ""
    if hist:
        hist_txt = "\n\n✏️ <b>Сообщение редактировали. Прошлые версии:</b>\n" + "\n".join(
            f"{i}) {html.escape((h or '—')[:200])}" for i, h in enumerate(hist, 1))
    body = f"\n\n<b>Последний текст:</b>\n{_quote(row['text'], 600 if row['kind'] != 'text' else 1500)}"
    if row["kind"] != "text":
        body = f"\n\n📎 Тип: {row['kind']}" + (f"\n{_quote(row['text'], 500)}" if row["text"] else "")
    await _send(bot, owner_id, head + body + hist_txt[:1200], row["kind"], row["file_id"])


async def notify_edited(bot, owner_id, row, new_text):
    head = f"✏️ <b>Сообщение изменено</b>\n{_who(row)}\n🕒 отправлено {_t(row['ts'])} · изменено {_t(time.time())}"
    await bot.send_message(owner_id, f"{head}\n\n<b>Было:</b>\n{_quote(row['text'])}\n<b>Стало:</b>\n{_quote(new_text)}"[:4000])


async def notify_edited_unknown(bot, owner_id, m, new_text):
    r = row_from_message(m)
    head = f"✏️ <b>Сообщение изменено</b>\n{_who(r)}\n🕒 отправлено {_t(r['ts'])} · изменено {_t(time.time())}"
    await bot.send_message(owner_id, f"{head}\n\n<b>Было:</b> <i>неизвестно (бот не видел оригинал)</i>\n<b>Стало:</b>\n{_quote(new_text)}"[:4000])


def _ago(ts) -> str:
    if not ts:
        return "—"
    d = int(time.time() - float(ts))
    base = datetime.fromtimestamp(float(ts), config.MSK).strftime("%d.%m %H:%M")
    return f"{base} ({d // 60} мин назад)" if d < 86400 else base


async def diag_text(bot, user_id: int) -> str:
    t = await db.get_tier(user_id)
    s = await db.get_all_s(user_id)
    conns = await db.fetchall("SELECT conn_id FROM connections WHERE user_id=? ORDER BY ts DESC", (user_id,))
    saved = (await db.fetchone("SELECT COUNT(*) c FROM saved s JOIN connections c ON c.conn_id=s.conn_id WHERE c.user_id=?", (user_id,)))["c"]
    try:
        await bot.send_chat_action(user_id, "typing")
        dm = "✅ да"
    except Exception as e:
        dm = f"❌ нет ({type(e).__name__}) — откройте бота и нажмите /start"
    lines = [
        f"🩺 <b>Диагностика</b> · версия <code>{config.VERSION}</code>",
        f"Тариф: {TIERS[t]}",
        f"Сохранение: {'включено' if s.get('save', '1') == '1' else 'ВЫКЛЮЧЕНО → /startsave'}",
        f"Бот может писать вам в личку: {dm}",
        f"Бизнес-подключений: {len(conns)}" + ("" if conns else " ⚠️ бот не подключён к аккаунту (см. «Подключение» в /start)"),
    ]
    if conns:
        try:
            bc = await bot.get_business_connection(conns[0]["conn_id"])
            r = getattr(bc, "rights", None)
            if r is not None:
                names = [("can_reply", "ответы"), ("can_read_messages", "чтение"), ("can_delete_sent_messages", "удаление своих"), ("can_delete_all_messages", "удаление всех")]
                lines.append("Права бота: " + " · ".join(f"{n} {'✅' if getattr(r, k, False) else '❌'}" for k, n in names))
            lines.append(f"Подключение активно: {'да' if getattr(bc, 'is_enabled', True) else 'НЕТ'}")
        except Exception as e:
            lines.append(f"Подключение: не удалось проверить ({html.escape(str(e)[:80])})")
    lines += [f"Сохранено сообщений: {saved}",
              f"Последнее входящее от собеседника: {_ago(s.get('last_in'))}",
              f"Последнее событие «удалено» от Telegram: {_ago(s.get('last_del_evt'))}",
              f"Удалено, но не было в базе: {_ago(s.get('last_del_miss'))}"]
    if s.get("save_err"):
        lines.append(f"❗ Ошибка доставки: <code>{html.escape(s['save_err'])}</code>")
    lines += ["", "<i>Сохраняются только сообщения собеседника, пришедшие ПОСЛЕ включения бота. Если собеседник удаляет сообщение, а «последнее событие удалено» не меняется — Telegram не присылает боту событие: проверьте, что бот подключён ко ВСЕМ личным чатам. Фото/видео с таймером не перехватываются.</i>"]
    return "\n".join(lines)


@command("startsave", section="manage", tier=0, help="присылать вам в бота удалённые и изменённые сообщения собеседников (по умолчанию включено)")
async def startsave(ctx):
    await db.set_s(ctx.owner_id, "save", "1")
    await ctx.edit("💾 Сохранение включено. Удалённые и изменённые сообщения собеседников приходят вам в личку с ботом. Проверить настройки: <code>.diag</code>")


@command("stopsave", section="manage", tier=0, help="выключить сохранение удалённых/изменённых сообщений")
async def stopsave(ctx):
    await db.set_s(ctx.owner_id, "save", "0")
    await ctx.edit("⏹ Сохранение выключено")


@command("clearsave", section="manage", tier=0, help="стереть всё сохранённое по этому чату")
async def clearsave(ctx):
    await db.execute("DELETE FROM saved WHERE conn_id=? AND chat_id=?", (ctx.conn_id, ctx.chat_id))
    await ctx.edit("🧹 Сохранённое по этому чату стёрто")


@command("diag", section="manage", help="диагностика: почему не приходят удалённые сообщения (ответ придёт вам в личку)")
async def diag(ctx):
    text = await diag_text(ctx.bot, ctx.owner_id)
    try:
        await ctx.bot.send_message(ctx.owner_id, text)
        await ctx.delete_cmd()
    except Exception as e:
        await ctx.edit(f"⚠️ Бот не может написать вам в личку ({type(e).__name__}). Откройте бота и нажмите /start — это главная причина, почему не приходят удалённые сообщения.")
