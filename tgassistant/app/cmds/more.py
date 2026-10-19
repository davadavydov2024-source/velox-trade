import html
import io
import random
import re
from datetime import date, datetime

from aiogram.types import BufferedInputFile
from PIL import Image, ImageDraw, ImageFont

from .. import config
from ..registry import command

FACTS = [
    "Мёд не портится: в гробницах Египта находили съедобный мёд возрастом тысячи лет.",
    "У осьминога три сердца и голубая кровь.",
    "Банан — это ягода, а клубника — нет.",
    "Сердце креветки находится в её голове.",
    "На Венере сутки длиннее года.",
    "Молния нагревает воздух до температуры выше, чем на поверхности Солнца.",
    "Коалы спят до 20 часов в сутки.",
    "Эйфелева башня летом становится выше на 15 см из-за теплового расширения.",
    "Улитки могут спать до трёх лет.",
    "Вомбаты делают кубические какашки.",
]


@command("spoiler", section="utils", usage="[текст]", help="текст под спойлером")
async def spoiler(ctx):
    t = ctx.text_arg()
    await ctx.edit(f"<tg-spoiler>{html.escape(t)}</tg-spoiler>" if t else "Формат: <code>.spoiler секрет</code>")


@command("mono", section="utils", usage="[текст]", help="моноширинный текст (удобно копировать)")
async def mono(ctx):
    t = ctx.text_arg()
    await ctx.edit(f"<code>{html.escape(t)}</code>" if t else "Формат: <code>.mono текст</code>")


@command("bq", section="utils", usage="[текст]", help="текст цитатой")
async def bq(ctx):
    t = ctx.text_arg()
    await ctx.edit(f"<blockquote>{html.escape(t)}</blockquote>" if t else "Формат: <code>.bq текст</code>")


@command("roll", section="fun", usage="[2d6+3]", help="бросок костей в формате NdM+K")
async def roll(ctx):
    m = re.fullmatch(r"(\d{1,2})d(\d{1,3})([+-]\d{1,4})?", (ctx.args or "1d6").lower().replace(" ", ""))
    if not m:
        return await ctx.edit("Формат: <code>.roll 2d6+3</code>")
    n, sides, bonus = int(m.group(1)), max(2, int(m.group(2))), int(m.group(3) or 0)
    rolls = [random.randint(1, sides) for _ in range(n)]
    extra = f" {bonus:+d}" if bonus else ""
    await ctx.edit(f"🎲 {n}d{sides}{extra}: {', '.join(map(str, rolls))} = <b>{sum(rolls) + bonus}</b>")


@command("days", section="utils", usage="[дд.мм.гггг | дд.мм]", help="сколько дней до даты / с даты (без года — до дня рождения)")
async def days(ctx):
    m = re.fullmatch(r"(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?", ctx.args.strip())
    if not m:
        return await ctx.edit("Формат: <code>.days 31.12.2026</code> или <code>.days 15.07</code>")
    today = datetime.now(config.MSK).date()
    d, mo, y = int(m.group(1)), int(m.group(2)), m.group(3)
    try:
        if y:
            delta = (date(int(y), mo, d) - today).days
        else:
            t = date(today.year, mo, d)
            if t < today:
                t = date(today.year + 1, mo, d)
            delta = (t - today).days
    except ValueError:
        return await ctx.edit("Такой даты не существует")
    if delta > 0:
        await ctx.edit(f"📅 До даты: <b>{delta}</b> дн.")
    elif delta == 0:
        await ctx.edit("📅 Это сегодня! 🎉")
    else:
        await ctx.edit(f"📅 Прошло: <b>{-delta}</b> дн.")


@command("fact", section="fun", help="случайный интересный факт")
async def fact(ctx):
    await ctx.edit(f"🧠 {random.choice(FACTS)}")


@command("color", section="utils", usage="[#rrggbb]", help="картинка-образец цвета")
async def color(ctx):
    h = ctx.args.strip().lstrip("#") or "%06x" % random.randint(0, 0xFFFFFF)
    if not re.fullmatch(r"[0-9a-fA-F]{6}", h):
        return await ctx.edit("Формат: <code>.color #ff8800</code>")
    img = Image.new("RGB", (400, 400), f"#{h}")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    txt = "#000" if (r * 299 + g * 587 + b * 114) / 1000 > 140 else "#fff"
    ImageDraw.Draw(img).text((200, 200), f"#{h.upper()}", font=ImageFont.load_default(size=56), fill=txt, anchor="mm")
    buf = io.BytesIO()
    img.save(buf, "PNG")
    await ctx.bot.send_photo(ctx.chat_id, BufferedInputFile(buf.getvalue(), "color.png"), caption=f"RGB({r}, {g}, {b})", **ctx.bc)
    await ctx.delete_cmd()


@command("poll", section="fun", usage="вопрос | вариант1 | вариант2", help="создать опрос в чате")
async def poll(ctx):
    parts = [p.strip() for p in ctx.args.split("|") if p.strip()]
    if len(parts) < 3:
        return await ctx.edit("Формат: <code>.poll Пицца или суши? | Пицца | Суши</code>")
    await ctx.bot.send_poll(ctx.chat_id, question=parts[0][:300], options=[o[:100] for o in parts[1:11]], **ctx.bc)
    await ctx.delete_cmd()
