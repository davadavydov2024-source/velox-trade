import html
import random
import time
from datetime import datetime

from .. import db, config
from ..registry import command, CMDS, SECTIONS, REG, TIERS


@command("version", section="info", help="версия запущенного бота")
async def version(ctx):
    await ctx.edit(f"ℹ️ Версия бота: <code>{config.VERSION}</code>")


@command("ping", section="info", help="проверить задержку бота")
async def ping(ctx):
    t = time.perf_counter()
    await ctx.edit("🏓 …")
    ms = int((time.perf_counter() - t) * 1000)
    await ctx.edit(f"🏓 pong — <b>{ms} мс</b>")


@command("time", section="info", help="текущее время (МСК)")
async def time_(ctx):
    await ctx.edit(f"🕐 <b>{datetime.now(config.MSK).strftime('%H:%M')}</b> МСК")


@command("date", section="info", help="текущая дата")
async def date_(ctx):
    await ctx.edit(f"📅 <b>{datetime.now(config.MSK).strftime('%d.%m.%Y')}</b>")


@command("me", "id", "chat", section="info", help="информация о вас и чате")
async def ident(ctx):
    m = ctx.msg
    lines = [
        f"👤 Вы: <code>{ctx.owner_id}</code>",
        f"💬 Чат: <code>{ctx.chat_id}</code> ({html.escape(m.chat.full_name or '')})",
    ]
    r = ctx.reply
    if r and r.from_user:
        lines.append(f"↩️ Из ответа: <code>{r.from_user.id}</code> {html.escape(r.from_user.full_name)}")
    await ctx.edit("\n".join(lines))


@command("business", section="info", help="ID бизнес-подключения")
async def business(ctx):
    await ctx.edit(f"🔌 <code>{ctx.conn_id}</code>")


@command("meta", section="info", help="данные сообщения в ответе")
async def meta(ctx):
    r = ctx.reply
    if not r:
        return await ctx.edit("Ответьте командой на сообщение")
    kind = "other"
    for a in ("text", "photo", "video", "sticker", "voice", "audio", "document", "video_note", "animation"):
        if getattr(r, a, None):
            kind = a
            break
    d = r.date.astimezone(config.MSK).strftime("%d.%m.%Y %H:%M:%S") if r.date else "?"
    lines = [
        f"🆔 message_id: <code>{r.message_id}</code>",
        f"👤 от: {html.escape(r.from_user.full_name) if r.from_user else '?'} (<code>{r.from_user.id if r.from_user else 0}</code>)",
        f"🗂 тип: {kind}",
        f"🕒 {d} МСК",
    ]
    t = r.text or r.caption
    if t:
        lines.append(f"🔤 длина текста: {len(t)}")
    if r.edit_date:
        lines.append("✏️ было отредактировано")
    await ctx.edit("\n".join(lines))


@command("help", "inf", section="info", usage="[команда]", help="список команд")
async def help_(ctx):
    arg = ctx.args.lower().lstrip(".")
    if arg and arg in REG:
        c = REG[arg]
        usage = f" {html.escape(c.usage)}" if c.usage else ""
        return await ctx.edit(
            f"<code>.{c.names[0]}{usage}</code> — {html.escape(c.help)}\nТариф: {TIERS[c.tier]}"
        )
    tier = await db.get_tier(ctx.owner_id)
    lines = [f"📖 <b>Команды</b> · ваш тариф: {TIERS[tier]}" + (" (🔒 — закрыто)" if tier < 2 else " — доступно всё"), ""]
    for sec, (icon, title) in SECTIONS.items():
        cs = [c for c in CMDS if c.section == sec and not c.hidden]
        if not cs:
            continue
        lines.append(f"{icon} <b>{title}</b>")
        lines.append(" ".join(f"<code>.{c.names[0]}</code>{'🔒' if c.tier > tier else ''}" for c in cs))
        lines.append("")
    lines.append("Подробнее: <code>.help команда</code> или /start в боте")
    await ctx.edit("\n".join(lines))


@command("cat", section="info", help="случайное изображение с котом")
async def cat(ctx):
    await ctx.bot.send_photo(ctx.chat_id, f"https://cataas.com/cat?t={random.randint(1, 10**9)}", **ctx.bc)
    await ctx.delete_cmd()


@command("status", section="info", help="статистика чата")
async def status(ctx):
    rows = await db.fetchall(
        "SELECT from_id, COUNT(*) c FROM msgs WHERE conn_id=? AND chat_id=? GROUP BY from_id",
        (ctx.conn_id, ctx.chat_id),
    )
    mine = sum(r["c"] for r in rows if r["from_id"] == ctx.owner_id)
    other = sum(r["c"] for r in rows if r["from_id"] != ctx.owner_id)
    await ctx.edit(f"📊 <b>Статистика чата</b> (за 30 дней)\nВаших сообщений: {mine}\nСобеседника: {other}\nВсего: {mine + other}")


@command("on", section="manage", help="включить бота")
async def on(ctx):
    await db.set_s(ctx.owner_id, "enabled", "1")
    await ctx.edit("✅ Бот включён")


@command("off", section="manage", help="выключить бота (команды перестанут работать)")
async def off(ctx):
    await db.set_s(ctx.owner_id, "enabled", "0")
    await ctx.edit("⛔ Бот выключен. Включить: <code>.on</code>")
