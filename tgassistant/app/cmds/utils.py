import ast
import asyncio
import base64
import html
import logging
import operator as op
import re
import secrets
import string
import time
from urllib.parse import quote

import aiohttp

from .. import db
from ..registry import command

log = logging.getLogger(__name__)

# ---------- калькулятор ----------
_OPS = {
    ast.Add: op.add, ast.Sub: op.sub, ast.Mult: op.mul, ast.Div: op.truediv,
    ast.FloorDiv: op.floordiv, ast.Mod: op.mod, ast.Pow: op.pow,
}


def _ev(n):
    if isinstance(n, ast.Expression):
        return _ev(n.body)
    if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
        return n.value
    if isinstance(n, ast.BinOp) and type(n.op) in _OPS:
        a, b = _ev(n.left), _ev(n.right)
        if isinstance(n.op, ast.Pow) and abs(b) > 100:
            raise ValueError("слишком большая степень")
        return _OPS[type(n.op)](a, b)
    if isinstance(n, ast.UnaryOp) and isinstance(n.op, (ast.USub, ast.UAdd)):
        v = _ev(n.operand)
        return -v if isinstance(n.op, ast.USub) else v
    raise ValueError("не могу посчитать")


def calc_expr(s: str):
    s = s.replace("×", "*").replace("÷", "/").replace("^", "**").replace(",", ".")
    return _ev(ast.parse(s.strip(), mode="eval"))


@command("calc", section="utils", usage="[пример]", help="калькулятор: .calc 2+2*2")
async def calc(ctx):
    expr = ctx.text_arg()
    if not expr:
        return await ctx.edit("Формат: <code>.calc 12*(3+4)</code>")
    try:
        r = calc_expr(expr)
    except ZeroDivisionError:
        return await ctx.edit("🧮 На ноль делить нельзя")
    except Exception as e:
        return await ctx.edit(f"🧮 Ошибка: {html.escape(str(e))}")
    r = round(r, 10) if isinstance(r, float) else r
    await ctx.edit(f"🧮 {html.escape(expr)} = <b>{r}</b>")


# ---------- погода / QR ----------
@command("weather", section="utils", usage="[город]", help="погода в городе")
async def weather(ctx):
    city = ctx.text_arg() or "Москва"
    url = f"https://wttr.in/{quote(city)}?format=%l:+%c+%t,+ощущается+%f,+ветер+%w,+влажность+%h&lang=ru"
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as s:
        async with s.get(url) as r:
            text = (await r.text()).strip()
    await ctx.edit(f"🌤 {html.escape(text)}")


@command("qr", section="utils", usage="[текст/ссылка]", help="создать QR-код")
async def qr(ctx):
    t = ctx.text_arg()
    if not t:
        return await ctx.edit("Формат: <code>.qr https://example.com</code>")
    await ctx.bot.send_photo(ctx.chat_id, f"https://api.qrserver.com/v1/create-qr-code/?size=500x500&data={quote(t)}", **ctx.bc)
    await ctx.delete_cmd()


# ---------- текст ----------
@command("pass", section="utils", usage="[длина]", help="сгенерировать пароль")
async def pass_(ctx):
    n = int(ctx.args) if ctx.args.isdigit() else 16
    n = max(8, ctx.limit(n, 64))
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*-_"
    await ctx.edit("🔑 <code>" + "".join(secrets.choice(alphabet) for _ in range(n)) + "</code>")


@command("mock", section="utils", usage="[текст]", help="тЕкСт вОт тАк")
async def mock(ctx):
    t = ctx.text_arg()
    if not t:
        return await ctx.edit("Формат: <code>.mock текст</code>")
    out, i = [], 0
    for c in t:
        if c.isalpha():
            out.append(c.upper() if i % 2 else c.lower())
            i += 1
        else:
            out.append(c)
    await ctx.edit(html.escape("".join(out)))


@command("reverse", section="utils", usage="[текст]", help="текст задом наперёд")
async def reverse(ctx):
    t = ctx.text_arg()
    await ctx.edit(html.escape(t[::-1]) if t else "Формат: <code>.reverse текст</code>")


@command("b64", section="utils", usage="[текст]", help="кодировать в base64")
async def b64(ctx):
    t = ctx.text_arg()
    await ctx.edit(f"<code>{base64.b64encode(t.encode()).decode()}</code>" if t else "Формат: <code>.b64 текст</code>")


@command("unb64", section="utils", usage="[base64]", help="декодировать из base64")
async def unb64(ctx):
    try:
        await ctx.edit(html.escape(base64.b64decode(ctx.text_arg().strip()).decode()))
    except Exception:
        await ctx.edit("⚠️ Это не похоже на base64")


_EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,./`QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>?~"
_RU = "йцукенгшщзхъфывапролджэячсмитьбю.ёЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ,Ё"
assert len(_EN) == len(_RU)
_TO_RU = str.maketrans(_EN, _RU)
_TO_EN = str.maketrans(_RU, _EN)


def fix_layout(s: str) -> str:
    latin = sum(c.isascii() and c.isalpha() for c in s)
    cyr = sum("а" <= c.lower() <= "я" or c in "ёЁ" for c in s)
    return s.translate(_TO_RU if latin >= cyr else _TO_EN)


@command("fix", "lay", section="utils", usage="[текст]", help="исправить текст, набранный не в той раскладке")
async def fix(ctx):
    t = ctx.text_arg()
    if not t:
        return await ctx.edit("Ответьте на сообщение или: <code>.fix ghbdtn</code>")
    await ctx.edit(html.escape(fix_layout(t)))


# ---------- таймер / кубик ----------
@command("timer", section="utils", usage="[секунды]", help="таймер (до 120 с, у админа без лимита)")
async def timer(ctx):
    n = ctx.limit(int(ctx.args), 120) if ctx.args.isdigit() and int(ctx.args) > 0 else 10
    step = 1 if n <= 20 else 3
    left = n
    while left > 0:
        await ctx.edit(f"⏳ <b>{left}</b> с")
        s = min(step, left)
        await asyncio.sleep(s)
        left -= s
    await ctx.edit("⏰ <b>Время вышло!</b>")


@command("dice", section="utils", usage="[🎲|🎯|🏀|⚽|🎳]", help="бросить кубик/мяч/дротик")
async def dice(ctx):
    emoji = ctx.args.strip() if ctx.args.strip() in ("🎲", "🎯", "🏀", "⚽", "🎳") else "🎲"
    await ctx.bot.send_dice(ctx.chat_id, emoji=emoji, **ctx.bc)
    await ctx.delete_cmd()


# ---------- напоминания (приходят вам в личку от бота) ----------
_UNITS = {"": 60, "s": 1, "с": 1, "m": 60, "м": 60, "h": 3600, "ч": 3600, "d": 86400, "д": 86400}


@command("remind", section="utils", usage="10m текст", help="напоминание в личку от бота (s/m/h/d или с/м/ч/д)")
async def remind(ctx):
    m = re.match(r"^(\d+)\s*([smhdсмчд]?)\s+(.+)$", ctx.args, re.S)
    if not m:
        return await ctx.edit("Формат: <code>.remind 30m купить хлеб</code> (s/m/h/d)")
    secs = min(int(m.group(1)) * _UNITS[m.group(2)], 30 * 86400)
    await db.execute("INSERT INTO reminders(owner_id, due, text) VALUES(?,?,?)", (ctx.owner_id, time.time() + secs, m.group(3)))
    msg = f"⏰ Напомню через {secs // 3600} ч {secs % 3600 // 60} мин {secs % 60} с"
    try:
        await ctx.bot.send_message(ctx.owner_id, msg)
        await ctx.delete_cmd()
    except Exception:
        await ctx.edit(msg)


async def remind_loop(bot):
    tick = 0
    while True:
        tick += 1
        try:
            if tick % 360 == 1:
                await db.execute("DELETE FROM saved WHERE ts < ?", (time.time() - 7 * 86400,))
            rows = await db.fetchall("SELECT * FROM reminders WHERE due <= ?", (time.time(),))
            for r in rows:
                await db.execute("DELETE FROM reminders WHERE id=?", (r["id"],))
                try:
                    await bot.send_message(r["owner_id"], f"⏰ <b>Напоминание</b>\n{html.escape(r['text'])}")
                except Exception as e:
                    log.warning("remind %s: %s", r["id"], e)
        except Exception:
            log.exception("remind_loop")
        await asyncio.sleep(10)
