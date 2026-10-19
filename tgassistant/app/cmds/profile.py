import asyncio
import json
import logging
import random
import time
from datetime import datetime, timedelta

from .. import db, config
from ..registry import command

log = logging.getLogger(__name__)
ACTIVE: dict[int, float] = {}

FIRST = ["Алексей", "Дмитрий", "Максим", "Артём", "Иван", "Кирилл", "Анна", "Мария", "Елена", "София", "Ольга", "Виктория"]
LAST = ["Орлов", "Волков", "Соколов", "Лебедев", "Ковалёв", "Морозов", "Зайцев", "Белов", "Крылов", "Фролов"]


async def _set_name(bot, conn_id, first, last):
    await bot.set_business_account_name(business_connection_id=conn_id, first_name=first, last_name=last or None)


async def _conn(ctx):
    return await db.get_conn(ctx.conn_id)


async def _name_error(ctx, e):
    await ctx.edit(f"⚠️ Не удалось сменить имя: {str(e)[:120]}\nПроверьте, что у бота есть право менять профиль (Настройки → Telegram Business → Чат-боты).")


@command("timeprofile", section="profile", tier=2, usage="[+/-часы]", help="время в имени (смещение от МСК)")
async def timeprofile(ctx):
    a = ctx.args.replace("+", "")
    off = int(a) if a.lstrip("-").isdigit() else 0
    await db.set_s(ctx.owner_id, "timeprofile", off)
    await ctx.edit(f"🕐 Время в имени включено (МСК{off:+d}). Обновляется раз в минуту.")


@command("untime", section="profile", tier=2, help="выключить время в профиле")
async def untime(ctx):
    await db.del_s(ctx.owner_id, "timeprofile")
    await _maybe_restore(ctx)
    await ctx.edit("✅ Время в имени выключено")


@command("timestatus", section="profile", tier=2, help="Online/Offline в имени (🟢/⚫️)")
async def timestatus(ctx):
    await db.set_s(ctx.owner_id, "timestatus", "1")
    await ctx.edit("🟢 Автостатус в имени включён")


@command("untimestatus", section="profile", tier=2, help="выключить автостатус и вернуть имя")
async def untimestatus(ctx):
    await db.del_s(ctx.owner_id, "timestatus")
    await _maybe_restore(ctx)
    await ctx.edit("✅ Автостатус выключен")


async def _maybe_restore(ctx):
    s = await db.get_all_s(ctx.owner_id)
    if "timeprofile" in s or "timestatus" in s or "fakep" in s:
        return
    c = await _conn(ctx)
    if c:
        try:
            await _set_name(ctx.bot, ctx.conn_id, c["first_name"], c["last_name"])
        except Exception as e:
            log.warning("restore name: %s", e)


@command("fakep", section="profile", tier=2, help="случайное имя вместо вашего")
async def fakep(ctx):
    first, last = random.choice(FIRST), random.choice(LAST)
    try:
        await _set_name(ctx.bot, ctx.conn_id, first, last)
    except Exception as e:
        return await _name_error(ctx, e)
    await db.set_s(ctx.owner_id, "fakep", "1")
    await ctx.edit(f"🎭 Теперь вы: <b>{first} {last}</b>\nВернуть: <code>.unfakep</code>")


@command("unfakep", section="profile", tier=2, help="вернуть своё имя")
async def unfakep(ctx):
    await db.del_s(ctx.owner_id, "fakep")
    c = await _conn(ctx)
    try:
        await _set_name(ctx.bot, ctx.conn_id, c["first_name"], c["last_name"])
    except Exception as e:
        return await _name_error(ctx, e)
    await ctx.edit("✅ Своё имя возвращено")


@command("panic", section="profile", tier=2, help="мгновенно удалить всю переписку в этом чате")
async def panic(ctx):
    await db.execute("DELETE FROM saved WHERE conn_id=? AND chat_id=?", (ctx.conn_id, ctx.chat_id))
    ids = await db.chat_msg_ids(ctx.conn_id, ctx.chat_id)
    ids = sorted(set(ids + [ctx.msg.message_id]))
    for i in range(0, len(ids), 100):
        try:
            await ctx.bot.delete_business_messages(business_connection_id=ctx.conn_id, message_ids=ids[i:i + 100])
        except Exception as e:
            log.warning("panic chunk: %s", e)
    await db.clear_chat_msgs(ctx.conn_id, ctx.chat_id)


def _flag(name, title, help_):
    async def on_(ctx):
        await db.set_s(ctx.owner_id, name, "1")
        await ctx.edit(f"✅ {title}: включено")

    async def off_(ctx):
        await db.del_s(ctx.owner_id, name)
        await ctx.edit(f"⛔ {title}: выключено")

    command(name, section="profile", tier=2, help=help_)(on_)
    command("un" + name, section="profile", tier=2, help="выключить: " + title.lower())(off_)


_flag("autoread", "Автопрочтение", "автоматически читать сообщения собеседника")
_flag("autotyping", "Автонабор", "имитация набора текста при входящих")
_flag("autovoice", "Автозапись голоса", "имитация записи голосового при входящих")


async def on_incoming(ctx):
    if await db.get_tier(ctx.owner_id) < 2:
        return
    s = await db.get_all_s(ctx.owner_id)
    if s.get("autoread") == "1":
        try:
            await ctx.bot.read_business_message(business_connection_id=ctx.conn_id, chat_id=ctx.chat_id, message_id=ctx.msg.message_id)
        except Exception as e:
            log.debug("autoread: %s", e)
    for key, action in (("autotyping", "typing"), ("autovoice", "record_voice")):
        if s.get(key) == "1":
            try:
                await ctx.bot.send_chat_action(chat_id=ctx.chat_id, action=action, **ctx.bc)
            except Exception as e:
                log.debug("%s: %s", key, e)


async def time_loop(bot):
    applied: dict[int, str] = {}
    while True:
        try:
            rows = await db.fetchall("SELECT user_id,key,value FROM settings WHERE key IN ('timeprofile','timestatus','fakep')")
            users: dict[int, dict] = {}
            for r in rows:
                users.setdefault(r["user_id"], {})[r["key"]] = r["value"]
            for uid, s in users.items():
                if "fakep" in s or not ({"timeprofile", "timestatus"} & s.keys()):
                    continue
                c = await db.latest_conn(uid)
                if not c:
                    continue
                parts = []
                if "timeprofile" in s:
                    t = datetime.now(config.MSK) + timedelta(hours=int(s["timeprofile"] or 0))
                    parts.append(t.strftime("%H:%M"))
                if "timestatus" in s:
                    parts.append("🟢" if time.time() - ACTIVE.get(uid, 0) < 300 else "⚫️")
                last = " ".join(([c["last_name"]] if c["last_name"] else []) + parts)[:64]
                if applied.get(uid) == last:
                    continue
                applied[uid] = last
                try:
                    await _set_name(bot, c["conn_id"], c["first_name"], last)
                except Exception as e:
                    log.warning("time_loop %s: %s", uid, e)
        except Exception:
            log.exception("time_loop")
        await asyncio.sleep(60)
