import re
import time

from .. import db
from ..registry import command

INF = 1e18
BAD = re.compile(
    r"(?i)(?<![а-яё])(хуй\w*|хуе\w*|хуё\w*|хуя\w*|пизд\w*|еб[аеёиоуыл]\w*|ёб\w*|бля\w*|сука|суки|мудак\w*|пидор\w*|гандон\w*)"
)
_hist: dict = {}


def _num(args):
    return int(args) if args.isdigit() else 0


@command("mute", section="mod", tier=2, usage="[N]", help="мут собеседника (N мин или до .unmute) — его сообщения удаляются")
async def mute(ctx):
    n = _num(ctx.args)
    await db.set_c(ctx.conn_id, ctx.chat_id, "mute_until", time.time() + n * 60 if n else INF)
    await ctx.edit(f"🔇 Мут {f'на {n} мин' if n else 'до .unmute'}")


@command("unmute", section="mod", tier=2, help="выключить мут")
async def unmute(ctx):
    await db.del_c(ctx.conn_id, ctx.chat_id, "mute_until")
    await db.del_c(ctx.conn_id, ctx.chat_id, "warn_cnt")
    await ctx.edit("🔊 Мут снят")


@command("mutestick", section="mod", tier=2, usage="[N]", help="удалять только стикеры (N мин или до .unmutestick)")
async def mutestick(ctx):
    n = _num(ctx.args)
    await db.set_c(ctx.conn_id, ctx.chat_id, "stick_until", time.time() + n * 60 if n else INF)
    await ctx.edit(f"🚫 Стикеры собеседника удаляются {f'{n} мин' if n else 'до .unmutestick'}")


@command("unmutestick", section="mod", tier=2, help="выключить мут стикеров")
async def unmutestick(ctx):
    await db.del_c(ctx.conn_id, ctx.chat_id, "stick_until")
    await ctx.edit("✅ Стикеры разрешены")


@command("nomute", section="mod", tier=2, help="обход мута и фильтров для этого чата")
async def nomute(ctx):
    await db.set_c(ctx.conn_id, ctx.chat_id, "nomute", "1")
    await ctx.edit("🛡 Обход фильтров включён")


@command("unnomute", section="mod", tier=2, help="выключить обход")
async def unnomute(ctx):
    await db.del_c(ctx.conn_id, ctx.chat_id, "nomute")
    await ctx.edit("✅ Обход выключен")


@command("warn", section="mod", tier=2, usage="N", help="автомут после N сообщений собеседника")
async def warn(ctx):
    n = _num(ctx.args)
    if not n:
        return await ctx.edit("Формат: <code>.warn 5</code>")
    await db.set_c(ctx.conn_id, ctx.chat_id, "warn_n", n)
    await db.set_c(ctx.conn_id, ctx.chat_id, "warn_cnt", 0)
    await ctx.edit(f"⚠️ Автомут после {n} сообщений")


@command("unwarn", section="mod", tier=2, help="снять warn")
async def unwarn(ctx):
    await db.del_c(ctx.conn_id, ctx.chat_id, "warn_n")
    await db.del_c(ctx.conn_id, ctx.chat_id, "warn_cnt")
    await ctx.edit("✅ Warn снят")


async def _toggle(ctx, key, title):
    a = ctx.args.lower()
    if a == "on":
        await db.set_c(ctx.conn_id, ctx.chat_id, key, "1")
        await ctx.edit(f"✅ {title}: включено")
    elif a == "off":
        await db.del_c(ctx.conn_id, ctx.chat_id, key)
        await ctx.edit(f"⛔ {title}: выключено")
    else:
        await ctx.edit(f"Формат: <code>.{key} on</code> / <code>off</code>")


@command("antispam", section="mod", tier=2, usage="on/off", help="антиспам")
async def antispam(ctx):
    await _toggle(ctx, "antispam", "Антиспам")


@command("antimat", section="mod", tier=2, usage="on/off", help="удалять мат и оскорбления")
async def antimat(ctx):
    await _toggle(ctx, "antimat", "Антимат")


async def check(ctx) -> bool:
    """Вызывается для сообщений собеседника. True — сообщение удалено."""
    if await db.get_tier(ctx.owner_id) < 2:
        return False
    kv = await db.get_all_c(ctx.conn_id, ctx.chat_id)
    if not kv or kv.get("nomute") == "1":
        return False
    m, now = ctx.msg, time.time()
    kill = False
    if float(kv.get("mute_until", 0)) > now:
        kill = True
    elif m.sticker and float(kv.get("stick_until", 0)) > now:
        kill = True
    elif kv.get("antimat") == "1" and BAD.search(m.text or m.caption or ""):
        kill = True
    elif kv.get("antispam") == "1":
        h = _hist.setdefault((ctx.conn_id, ctx.chat_id), [])
        h.append(now)
        h[:] = [t for t in h if now - t < 8]
        kill = len(h) > 6
    wn = int(kv.get("warn_n", 0))
    if wn and not kill:
        cnt = int(kv.get("warn_cnt", 0)) + 1
        if cnt >= wn:
            await db.set_c(ctx.conn_id, ctx.chat_id, "mute_until", INF)
            await db.del_c(ctx.conn_id, ctx.chat_id, "warn_n")
            await db.del_c(ctx.conn_id, ctx.chat_id, "warn_cnt")
        else:
            await db.set_c(ctx.conn_id, ctx.chat_id, "warn_cnt", cnt)
    if kill:
        try:
            await ctx.delete_msg(m.message_id)
        except Exception:
            return False
    return kill
