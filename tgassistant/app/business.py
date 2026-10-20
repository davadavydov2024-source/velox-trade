import html
import json
import logging
import time
import traceback

from aiogram import Bot, Router
from aiogram.types import BusinessConnection, BusinessMessagesDeleted, Message

from . import config, db, errlog, registry
from .ctx import Ctx
from .cmds import info, fun, anim, media, games, series, moderation, profile, admin, utils, saver, extra, more, tools, life, misc, music  # noqa: F401  (регистрация команд)

log = logging.getLogger(__name__)
router = Router()


async def owner_of(bot: Bot, conn_id: str) -> int:
    row = await db.get_conn(conn_id)
    if row:
        return row["user_id"]
    bc = await bot.get_business_connection(conn_id)
    await db.save_conn(conn_id, bc.user.id, bc.user.first_name, bc.user.last_name or "", bc.user.username or "")
    return bc.user.id


@router.business_connection()
async def on_connection(bc: BusinessConnection, bot: Bot):
    u = bc.user
    first = not await db.fetchone("SELECT 1 FROM connections WHERE user_id=?", (u.id,))
    await db.save_conn(bc.id, u.id, u.first_name, u.last_name or "", u.username or "")
    if not bc.is_enabled:
        return
    trial = ""
    if first and config.TRIAL_DAYS > 0 and not db.is_staff(u.id) and not await db.get_subs(u.id):
        await db.grant(u.id, 1, config.TRIAL_DAYS)
        trial = f"\n🎁 Вам подарено <b>{config.TRIAL_DAYS} дн. PREMIUM</b> на пробу."
    inviter = await db.get_s(u.id, "ref") if first else None
    if inviter and inviter.isdigit() and int(inviter) != u.id and config.REF_DAYS > 0:
        await db.apply_sub(int(inviter), 1, config.REF_DAYS)
        try:
            await bot.send_message(int(inviter), f"🎉 Ваш друг подключил бота! Вам +{config.REF_DAYS} дн. PREMIUM.")
        except Exception:
            pass
    try:
        await bot.send_message(
            bc.user_chat_id,
            "✅ <b>Бот подключён к вашему аккаунту.</b>\n"
            "Проверьте: напишите в любом личном чате <code>.ping</code>, список команд — <code>.help</code>.\n"
            "💾 Удалённые для всех и изменённые сообщения собеседников будут приходить сюда с именем, @username, старым и новым текстом "
            "(выключить: /stopsave). Если что-то не приходит — /diag.\n"
            "Меню и тарифы — /start." + trial,
        )
    except Exception:
        pass


async def dispatch(ctx: Ctx, text: str):
    parts = text[1:].split(maxsplit=1)
    if not parts:
        return
    name = parts[0].lower()
    cmd = registry.REG.get(name)
    if not cmd:
        return
    ctx.args = parts[1].strip() if len(parts) > 1 else ""
    await db.touch_username(ctx.owner_id, (ctx.msg.from_user.username if ctx.msg.from_user else "") or "")
    if not ctx.is_staff:
        if ctx.owner_id in db.BANNED:
            return
        if db.STATE["maint"]:
            return await ctx.edit("🛠 Технические работы, скоро вернёмся")
        if cmd.names[0] in db.DISABLED:
            return await ctx.edit("⛔ Эта команда временно отключена администратором")
        blocked = json.loads(await db.get_s(ctx.owner_id, "blocked_cmds", "[]"))
        if cmd.names[0] in blocked:
            return await ctx.edit("⛔ Эта команда отключена для вас администратором")
    if name != "on" and await db.get_s(ctx.owner_id, "enabled", "1") == "0":
        return
    tier = await db.get_tier(ctx.owner_id)
    if tier < cmd.tier:
        return await ctx.edit(f"🔒 Команда <code>.{name}</code> — нужен тариф {registry.TIERS[cmd.tier]} (у вас {registry.TIERS[tier]}). Тарифы: /tariffs в боте" + ("" if config.ADMIN_ID else "\n⚠️ На сервере не задан ADMIN_ID — владельцу: /myrole"))
    try:
        await cmd.fn(ctx)
        await db.log_cmd(cmd.names[0])
        await db.touch_seen(ctx.owner_id)
    except Exception as e:
        log.exception("команда .%s упала", name)
        await errlog.report(ctx.bot, f".{name} (user {ctx.owner_id}): {type(e).__name__}: {e}\n{traceback.format_exc()[-1200:]}", key=f"cmd:{name}:{type(e).__name__}")
        try:
            await ctx.send(f"⚠️ <code>.{name}</code>: {html.escape(str(e)[:200])}")
        except Exception:
            pass


@router.business_message()
async def on_business_message(message: Message, bot: Bot):
    conn_id = message.business_connection_id
    try:
        owner_id = await owner_of(bot, conn_id)
    except Exception:
        log.exception("не удалось получить подключение")
        return
    sender = message.from_user.id if message.from_user else 0
    is_owner = sender == owner_id
    chat_id = message.chat.id
    await db.log_msg(conn_id, chat_id, message.message_id, sender)
    await series.touch(conn_id, chat_id, is_owner, message.chat.full_name or "")
    ctx = Ctx(bot, message, conn_id, owner_id)
    text = message.text or message.caption or ""
    if is_owner:
        profile.ACTIVE[owner_id] = time.time()
        if text.startswith(".") and len(text) > 1:
            return await dispatch(ctx, text)
        await games.on_move(ctx, text)
    else:
        if await moderation.check(ctx):
            return
        await db.set_s(owner_id, "last_in", time.time())
        if await saver.enabled(owner_id):
            await saver.remember(message, conn_id)
        await extra.afk_reply(ctx)
        await profile.on_incoming(ctx)
        await games.on_move(ctx, text)


@router.edited_business_message()
async def on_edited(message: Message, bot: Bot):
    conn_id = message.business_connection_id
    try:
        owner_id = await owner_of(bot, conn_id)
    except Exception:
        return
    if (message.from_user and message.from_user.id == owner_id) or not await saver.enabled(owner_id):
        return
    row = await saver.get(conn_id, message.chat.id, message.message_id)
    new_text = message.text or message.caption or ""
    try:
        if row is None:
            await saver.notify_edited_unknown(bot, owner_id, message, new_text)
        elif (row["text"] or "") != new_text:
            await saver.notify_edited(bot, owner_id, row, new_text)
        await db.del_s(owner_id, "save_err")
    except Exception as e:
        await saver.mark_fail(owner_id, e)
    await saver.remember(message, conn_id, edited=True)


@router.deleted_business_messages()
async def on_deleted(event: BusinessMessagesDeleted, bot: Bot):
    conn_id = event.business_connection_id
    try:
        owner_id = await owner_of(bot, conn_id)
    except Exception:
        return
    await db.set_s(owner_id, "last_del_evt", time.time())
    if not await saver.enabled(owner_id):
        return
    for mid in event.message_ids:
        row = await saver.get(conn_id, event.chat.id, mid)
        if not row:
            await db.set_s(owner_id, "last_del_miss", time.time())
            continue
        if row["from_id"] != owner_id:
            try:
                await saver.notify_deleted(bot, owner_id, row)
                await db.del_s(owner_id, "save_err")
            except Exception as e:
                await saver.mark_fail(owner_id, e)
