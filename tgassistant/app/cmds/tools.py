import html
import random
import time
import uuid as uuidlib
from datetime import datetime

from .. import config
from ..registry import command

START = time.time()


async def _need(ctx, hint):
    t = ctx.text_arg()
    if not t:
        await ctx.edit(hint)
    return t


# ---------- текст ----------
@command("upper", section="utils", usage="[текст]", help="ТЕКСТ ЗАГЛАВНЫМИ")
async def upper(ctx):
    t = await _need(ctx, "Формат: <code>.upper текст</code>")
    if t:
        await ctx.edit(html.escape(t.upper()))


@command("lower", section="utils", usage="[текст]", help="текст строчными")
async def lower(ctx):
    t = await _need(ctx, "Формат: <code>.lower ТЕКСТ</code>")
    if t:
        await ctx.edit(html.escape(t.lower()))


@command("count", section="utils", usage="[текст]", help="сколько символов, слов и строк в тексте")
async def count(ctx):
    t = await _need(ctx, "Ответьте на сообщение или: <code>.count текст</code>")
    if t:
        await ctx.edit(f"🔢 Символов: <b>{len(t)}</b> (без пробелов {len(''.join(t.split()))}) · слов: <b>{len(t.split())}</b> · строк: <b>{len(t.splitlines())}</b>")


@command("fancy", section="utils", usage="[текст]", help="𝐉𝐢𝐫𝐧𝐲𝐣 шрифт для латиницы и цифр")
async def fancy(ctx):
    t = await _need(ctx, "Формат: <code>.fancy Hello 2026</code>")
    if not t:
        return

    def conv(c):
        if "A" <= c <= "Z":
            return chr(0x1D400 + ord(c) - 65)
        if "a" <= c <= "z":
            return chr(0x1D41A + ord(c) - 97)
        if "0" <= c <= "9":
            return chr(0x1D7CE + ord(c) - 48)
        return c

    await ctx.edit(html.escape("".join(conv(c) for c in t)))


@command("vapor", section="utils", usage="[текст]", help="ｗｉｄｅ текст")
async def vapor(ctx):
    t = await _need(ctx, "Формат: <code>.vapor hello</code>")
    if t:
        await ctx.edit(html.escape("".join(chr(ord(c) + 0xFEE0) if "!" <= c <= "~" else "　" if c == " " else c for c in t)))


@command("zalgo", section="utils", usage="[текст]", help="т̷е̷к̷с̷т̷ в стиле глитч")
async def zalgo(ctx):
    t = await _need(ctx, "Формат: <code>.zalgo привет</code>")
    if t:
        await ctx.edit(html.escape("".join(c + "".join(chr(random.randint(0x300, 0x36F)) for _ in range(random.randint(2, 4))) if not c.isspace() else c for c in t[:100])))


@command("clap", section="utils", usage="[текст]", help="слова 👏 через 👏 хлопки")
async def clap(ctx):
    t = await _need(ctx, "Формат: <code>.clap очень круто</code>")
    if t:
        await ctx.edit("👏 " + " 👏 ".join(html.escape(w) for w in t.split()) + " 👏")


@command("repeat", section="utils", usage="N [текст]", help="повторить текст N раз (до 50, админам без лимита)")
async def repeat(ctx):
    a = ctx.args.split(maxsplit=1)
    if len(a) < 2 or not a[0].isdigit():
        return await ctx.edit("Формат: <code>.repeat 5 ха</code>")
    n = ctx.limit(max(1, int(a[0])), 50)
    out = " ".join([a[1]] * n)
    await ctx.edit(html.escape(out[:4000]))


# ---------- числа и конвертеры ----------
@command("base", "bin", "hex", "dec", "oct", section="utils", usage="[число]", help="число в разных системах: .base 255 / 0xff / 0b1010")
async def base(ctx):
    raw = ctx.text_arg().strip().lower()
    try:
        n = int(raw, 0)
    except ValueError:
        try:
            n = int(raw)
        except ValueError:
            return await ctx.edit("Формат: <code>.base 255</code>, <code>.base 0xff</code> или <code>.base 0b1010</code>")
    await ctx.edit(f"🔢 <b>{n}</b>\nBIN: <code>{bin(n)}</code>\nOCT: <code>{oct(n)}</code>\nHEX: <code>{hex(n)}</code>")


@command("pct", section="utils", usage="[a] [b]", help="проценты: .pct 15 200 → 15% от 200 и сколько % составляет 15 от 200")
async def pct(ctx):
    try:
        a, b = [float(x.replace(",", ".")) for x in ctx.args.split()[:2]]
    except ValueError:
        return await ctx.edit("Формат: <code>.pct 15 200</code>")
    share = f"{a / b * 100:.2f}%" if b else "—"
    await ctx.edit(f"📐 {a:g}% от {b:g} = <b>{a * b / 100:g}</b>\n{a:g} это <b>{share}</b> от {b:g}")


_LEN = {"mm": 0.001, "cm": 0.01, "m": 1, "km": 1000, "in": 0.0254, "ft": 0.3048, "yd": 0.9144, "mi": 1609.344}
_MASS = {"g": 0.001, "kg": 1, "lb": 0.45359237, "oz": 0.028349523}
_VOL = {"ml": 0.001, "l": 1, "gal": 3.785411784}


@command("convert", section="utils", usage="[число] [из] [в]", help="единицы: .convert 10 km mi (км, м, см, мили, футы, кг, фунты, л, °C/°F)")
async def convert(ctx):
    a = ctx.args.lower().replace(",", ".").split()
    if len(a) < 3:
        return await ctx.edit("Формат: <code>.convert 10 km mi</code>\nЕдиницы: mm cm m km in ft yd mi · g kg lb oz · ml l gal · c f k")
    try:
        x = float(a[0])
    except ValueError:
        return await ctx.edit("Первым должно быть число")
    src, dst = a[1], a[2]
    if src in ("c", "f", "k") and dst in ("c", "f", "k"):
        c = x if src == "c" else (x - 32) * 5 / 9 if src == "f" else x - 273.15
        r = c if dst == "c" else c * 9 / 5 + 32 if dst == "f" else c + 273.15
        return await ctx.edit(f"🌡 {x:g}°{src.upper()} = <b>{r:.2f}</b>°{dst.upper()}")
    for table in (_LEN, _MASS, _VOL):
        if src in table and dst in table:
            return await ctx.edit(f"📏 {x:g} {src} = <b>{x * table[src] / table[dst]:.6g}</b> {dst}")
    await ctx.edit("Не умею конвертировать эти единицы. Список: <code>.convert</code>")


@command("roman", section="utils", usage="[число|римское]", help="арабские ↔ римские числа")
async def roman(ctx):
    t = ctx.args.strip().upper()
    vals = [(1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"), (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]
    if t.isdigit() and 0 < int(t) < 4000:
        n, out = int(t), ""
        for v, s in vals:
            while n >= v:
                out += s
                n -= v
        return await ctx.edit(f"🏛 {t} = <b>{out}</b>")
    if t and set(t) <= set("IVXLCDM"):
        i, total = 0, 0
        for v, s in vals:
            while t.startswith(s, i):
                total += v
                i += len(s)
        if i == len(t):
            return await ctx.edit(f"🏛 {t} = <b>{total}</b>")
    await ctx.edit("Формат: <code>.roman 2026</code> или <code>.roman MMXXVI</code>")


@command("prime", section="utils", usage="[число]", help="простое ли число (до 10¹²)")
async def prime(ctx):
    if not ctx.args.strip().isdigit() or not 1 < int(ctx.args) <= 10**12:
        return await ctx.edit("Формат: <code>.prime 97</code> (число от 2 до 10¹²)")
    n = int(ctx.args)
    d = next((i for i in range(2, int(n ** 0.5) + 1) if n % i == 0), None)
    await ctx.edit(f"🔎 {n} — <b>простое</b> ✅" if d is None else f"🔎 {n} — составное, делится на {d}")


# ---------- время / служебное ----------
CITIES = {"москва": "Europe/Moscow", "лондон": "Europe/London", "нью-йорк": "America/New_York", "токио": "Asia/Tokyo", "дубай": "Asia/Dubai",
          "берлин": "Europe/Berlin", "киев": "Europe/Kyiv", "минск": "Europe/Minsk", "алматы": "Asia/Almaty", "ташкент": "Asia/Tashkent",
          "париж": "Europe/Paris", "пекин": "Asia/Shanghai", "стамбул": "Europe/Istanbul", "лос-анджелес": "America/Los_Angeles"}


@command("wt", section="utils", usage="[город]", help="время в другом городе (Лондон, Токио, Нью-Йорк, Дубай…)")
async def wt(ctx):
    try:
        from zoneinfo import ZoneInfo
        names = [ctx.args.strip().lower()] if ctx.args.strip() else ["москва", "лондон", "нью-йорк", "токио"]
        lines = []
        for n in names:
            tz = CITIES.get(n)
            if not tz:
                return await ctx.edit("Города: " + ", ".join(CITIES))
            lines.append(f"🕐 {n.title()}: <b>{datetime.now(ZoneInfo(tz)):%H:%M}</b> ({datetime.now(ZoneInfo(tz)):%d.%m})")
        await ctx.edit("\n".join(lines))
    except Exception:
        await ctx.edit("⚠️ Нет базы часовых поясов на сервере (pip install tzdata)")


@command("uptime", section="info", help="сколько бот работает без перезапуска")
async def uptime(ctx):
    s = int(time.time() - START)
    await ctx.edit(f"⏱ Бот работает: <b>{s // 86400} д {s % 86400 // 3600} ч {s % 3600 // 60} мин</b>")


@command("uuid", section="utils", help="случайный UUID")
async def uuid_(ctx):
    await ctx.edit(f"🆔 <code>{uuidlib.uuid4()}</code>")


@command("team", section="fun", usage="N имена…", help="разбить имена на N команд: .team 2 Аня Боря Вася Гоша")
async def team(ctx):
    a = ctx.args.split()
    if len(a) < 3 or not a[0].isdigit() or not 2 <= int(a[0]) <= len(a) - 1:
        return await ctx.edit("Формат: <code>.team 2 Аня Боря Вася Гоша</code>")
    names = a[1:]
    random.shuffle(names)
    n = int(a[0])
    await ctx.edit("👥 <b>Команды</b>\n" + "\n".join(f"{i + 1}: " + ", ".join(html.escape(x) for x in names[i::n]) for i in range(n)))


# ---------- общение ----------
def _who(ctx):
    me = html.escape(ctx.msg.from_user.first_name if ctx.msg.from_user else "Я")
    other = html.escape(ctx.msg.chat.first_name or ctx.msg.chat.full_name or "друг")
    return me, other


@command("hug", section="fun", help="обнять собеседника")
async def hug(ctx):
    me, other = _who(ctx)
    await ctx.edit(f"🤗 {me} обнимает {other}")


@command("pat", section="fun", help="погладить по голове")
async def pat(ctx):
    me, other = _who(ctx)
    await ctx.edit(f"🥰 {me} гладит {other} по голове")


@command("highfive", section="fun", help="дать пять")
async def highfive(ctx):
    me, other = _who(ctx)
    await ctx.edit(f"🙌 {me} и {other} дают пять!")


COMPLIMENTS = ["С тобой всегда легко и интересно.", "У тебя отличное чувство юмора.", "Ты умеешь поддержать в нужный момент.",
               "Твои идеи реально вдохновляют.", "Ты делаешь этот чат лучше.", "У тебя замечательный вкус.", "Ты надёжный человек."]
ADVICE = ["Начни с самого маленького шага — остальное подтянется.", "Выспись, а потом решай.", "Запиши идею, пока не забыл.",
          "Сделай перерыв на 10 минут и выйди на воздух.", "Не сравнивай себя с другими — сравнивай с собой вчерашним.",
          "Попроси помощи, это не слабость.", "Сделай сложное первым делом утром."]
WISHES = ["Пусть сегодня всё получится с первого раза ✨", "Пусть будет много поводов для улыбки 😊", "Пусть удача сама находит тебя 🍀",
          "Пусть день будет лёгким, а вечер уютным 🌙", "Пусть сбудется то, о чём думаешь прямо сейчас 🌠"]
RIDDLES = [("Зимой и летом одним цветом. Что это?", "Ель"), ("Не лает, не кусает, а в дом не пускает.", "Замок"),
           ("Что можно увидеть с закрытыми глазами?", "Сон"), ("Чем больше берёшь, тем больше становится. Что это?", "Яма"),
           ("Без окон, без дверей полна горница людей.", "Огурец"), ("Сто одежек и все без застёжек.", "Капуста"),
           ("Что идёт, но никогда не приходит?", "Время"), ("Кто говорит на всех языках?", "Эхо")]


@command("compliment", section="fun", help="случайный комплимент")
async def compliment(ctx):
    await ctx.edit(f"💐 {random.choice(COMPLIMENTS)}")


@command("advice", section="fun", help="случайный совет")
async def advice(ctx):
    await ctx.edit(f"💡 {random.choice(ADVICE)}")


@command("wish", section="fun", help="случайное пожелание")
async def wish(ctx):
    await ctx.edit(random.choice(WISHES))


@command("riddle", section="fun", help="загадка (ответ под спойлером)")
async def riddle(ctx):
    q, a = random.choice(RIDDLES)
    await ctx.edit(f"❓ {q}\n\n<tg-spoiler>Ответ: {a}</tg-spoiler>")
