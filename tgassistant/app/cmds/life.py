import codecs
import hashlib
import html
import math
import random
import re
from datetime import date, datetime, timedelta, timezone

from .. import config
from ..registry import command

SIGNS = [("овен", "♈"), ("телец", "♉"), ("близнецы", "♊"), ("рак", "♋"), ("лев", "♌"), ("дева", "♍"),
         ("весы", "♎"), ("скорпион", "♏"), ("стрелец", "♐"), ("козерог", "♑"), ("водолей", "♒"), ("рыбы", "♓")]
HORO = ["Хороший день, чтобы начать то, что давно откладывал(а).", "Обрати внимание на мелочи — там спрятана удача.",
        "Неожиданный разговор принесёт полезную идею.", "Лучше не спорить сегодня — береги силы.",
        "Тебя ждёт приятная новость ближе к вечеру.", "День подходит для встреч и новых знакомств.",
        "Сделай паузу и подумай, прежде чем отвечать.", "Финансовые вопросы лучше обсуждать спокойно.",
        "Сегодня стоит довериться интуиции.", "Удачный день для учёбы и творчества.",
        "Кто-то из старых друзей вспомнит о тебе.", "Позаботься о себе: отдых — тоже работа."]
ADJ = ["Тёмный", "Быстрый", "Хитрый", "Звёздный", "Ледяной", "Огненный", "Тихий", "Дикий", "Космический", "Весёлый", "Ночной", "Золотой"]
NOUN = ["Волк", "Дракон", "Ниндзя", "Лис", "Кот", "Пират", "Тигр", "Феникс", "Медведь", "Сокол", "Рыцарь", "Енот"]
EMOJIS = list("😀😎🤖👻🔥✨🌈🍕🍩🎮🎧🚀🌙⭐🍀🎯🧠💎🎈🐱🐶🦊🐼🐸🦄🍉🍓⚡🌸🎲🎁🧩🏆📚🎬🎵")
KAO = ["(ᵔᴥᵔ)", "(づ｡◕‿‿◕｡)づ", "ʕ•ᴥ•ʔ", "(ノ◕ヮ◕)ノ*:･ﾟ✧", "(｡♥‿♥｡)", "(҂◡_◡) ᕤ", "ᕕ( ᐛ )ᕗ", "(⌐■_■)", "(＾▽＾)", "( ˘▽˘)っ♨"]
MOON = [(0.03, "🌑 Новолуние"), (0.25, "🌒 Растущий серп"), (0.28, "🌓 Первая четверть"), (0.47, "🌔 Растущая Луна"),
        (0.53, "🌕 Полнолуние"), (0.72, "🌖 Убывающая Луна"), (0.78, "🌗 Последняя четверть"), (0.97, "🌘 Убывающий серп"), (1.01, "🌑 Новолуние")]


def _sign(d: int, m: int):
    edges = [(1, 20, 10), (2, 19, 11), (3, 21, 0), (4, 20, 1), (5, 21, 2), (6, 21, 3), (7, 23, 4), (8, 23, 5), (9, 23, 6), (10, 23, 7), (11, 22, 8), (12, 22, 9)]
    for month, day, idx in edges[::-1]:
        if (m, d) >= (month, day):
            return SIGNS[idx]
    return SIGNS[9]


@command("horo", section="fun", usage="[знак]", help="гороскоп на сегодня (стабильный в течение дня)")
async def horo(ctx):
    name = ctx.args.strip().lower()
    sign = next(((n, e) for n, e in SIGNS if n == name), None)
    if not sign:
        return await ctx.edit("Знаки: " + ", ".join(f"{e} {n}" for n, e in SIGNS) + "\nФормат: <code>.horo лев</code>")
    seed = int(hashlib.sha256(f"{sign[0]}{datetime.now(config.MSK).date()}".encode()).hexdigest(), 16)
    await ctx.edit(f"{sign[1]} <b>{sign[0].title()}</b>\n{HORO[seed % len(HORO)]}\n🍀 Удача: <b>{seed // 7 % 101}%</b> · ❤️ Любовь: <b>{seed // 13 % 101}%</b>")


def _parse_date(s: str):
    m = re.fullmatch(r"(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?", s.strip())
    if not m:
        return None
    try:
        return int(m.group(1)), int(m.group(2)), int(m.group(3)) if m.group(3) else None
    except ValueError:
        return None


@command("zodiac", section="fun", usage="[дд.мм]", help="знак зодиака по дате рождения")
async def zodiac(ctx):
    p = _parse_date(ctx.args)
    if not p or not (1 <= p[1] <= 12 and 1 <= p[0] <= 31):
        return await ctx.edit("Формат: <code>.zodiac 15.07</code>")
    n, e = _sign(p[0], p[1])
    await ctx.edit(f"{e} Знак зодиака: <b>{n.title()}</b>")


@command("age", section="fun", usage="[дд.мм.гггг]", help="возраст по дате рождения и дни до дня рождения")
async def age(ctx):
    p = _parse_date(ctx.args)
    if not p or not p[2]:
        return await ctx.edit("Формат: <code>.age 15.07.2000</code>")
    try:
        born = date(p[2], p[1], p[0])
    except ValueError:
        return await ctx.edit("Такой даты не существует")
    today = datetime.now(config.MSK).date()
    if born > today:
        return await ctx.edit("Дата рождения в будущем 🙂")
    years = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
    months = (today.month - born.month - (today.day < born.day)) % 12
    try:
        nxt = born.replace(year=today.year)
    except ValueError:
        nxt = date(today.year, 3, 1)
    if nxt < today:
        try:
            nxt = born.replace(year=today.year + 1)
        except ValueError:
            nxt = date(today.year + 1, 3, 1)
    await ctx.edit(f"🎂 Возраст: <b>{years}</b> лет {months} мес.\nПрожито дней: {(today - born).days}\nДо дня рождения: <b>{(nxt - today).days}</b> дн.")


@command("moon", section="fun", help="фаза Луны сегодня")
async def moon(ctx):
    age_d = ((datetime.now(timezone.utc) - datetime(2000, 1, 6, 18, 14, tzinfo=timezone.utc)).total_seconds() / 86400) % 29.530588853
    frac = age_d / 29.530588853
    name = next(n for lim, n in MOON if frac < lim)
    await ctx.edit(f"{name}\nВозраст Луны: {age_d:.1f} дн. · освещено ≈ {(1 - math.cos(2 * math.pi * frac)) / 2 * 100:.0f}%")


@command("nick", section="fun", help="придумать 5 никнеймов")
async def nick(ctx):
    await ctx.edit("🏷 <b>Никнеймы</b>\n" + "\n".join(f"<code>{random.choice(ADJ)}{random.choice(NOUN)}{random.randint(1, 99)}</code>" for _ in range(5)))


@command("emoji", section="fun", usage="[N]", help="случайные эмодзи")
async def emoji(ctx):
    n = min(30, max(1, int(ctx.args))) if ctx.args.isdigit() else 8
    await ctx.edit("".join(random.choice(EMOJIS) for _ in range(n)))


@command("shrug", section="fun", help="¯\\_(ツ)_/¯")
async def shrug(ctx):
    await ctx.edit(html.escape("¯\\_(ツ)_/¯"))


@command("tableflip", section="fun", help="(╯°□°)╯︵ ┻━┻")
async def tableflip(ctx):
    await ctx.edit("(╯°□°)╯︵ ┻━┻")


@command("lenny", section="fun", help="( ͡° ͜ʖ ͡°)")
async def lenny(ctx):
    await ctx.edit("( ͡° ͜ʖ ͡°)")


@command("kao", section="fun", help="случайный каомодзи")
async def kao(ctx):
    await ctx.edit(html.escape(random.choice(KAO)))


def _dice(name, emoji_, title):
    async def run(ctx):
        await ctx.bot.send_dice(ctx.chat_id, emoji=emoji_, **ctx.bc)
        await ctx.delete_cmd()

    command(name, section="fun", help=title)(run)


_dice("dart", "🎯", "бросить дротик 🎯")
_dice("basket", "🏀", "бросок в кольцо 🏀")
_dice("football", "⚽", "удар по воротам ⚽")
_dice("bowl", "🎳", "боулинг 🎳")


# ---------- текст и шифры ----------
@command("shuffle", section="fun", usage="[слова]", help="перемешать список: .shuffle а б в г")
async def shuffle(ctx):
    w = ctx.args.split()
    if len(w) < 2:
        return await ctx.edit("Формат: <code>.shuffle Аня Боря Вася</code>")
    random.shuffle(w)
    await ctx.edit(html.escape(" ".join(w)))


@command("sort", section="calc", usage="[числа или слова]", help="отсортировать список")
async def sort(ctx):
    w = ctx.args.replace(",", " ").split()
    if len(w) < 2:
        return await ctx.edit("Формат: <code>.sort 5 3 9 1</code>")
    try:
        out = sorted(w, key=float)
    except ValueError:
        out = sorted(w, key=str.lower)
    await ctx.edit(html.escape(" ".join(out)))


@command("rot13", section="text", usage="[текст]", help="шифр ROT13 (латиница)")
async def rot13(ctx):
    t = ctx.text_arg()
    await ctx.edit(html.escape(codecs.encode(t, "rot13")) if t else "Формат: <code>.rot13 hello</code>")


def _caesar(text: str, k: int) -> str:
    out = []
    for c in text:
        for alpha in ("abcdefghijklmnopqrstuvwxyz", "абвгдеёжзийклмнопрстуфхцчшщъыьэюя"):
            if c.lower() in alpha:
                n = alpha[(alpha.index(c.lower()) + k) % len(alpha)]
                c = n.upper() if c.isupper() else n
                break
        out.append(c)
    return "".join(out)


@command("caesar", section="text", usage="N [текст]", help="шифр Цезаря (сдвиг N, отрицательный — расшифровка)")
async def caesar(ctx):
    a = ctx.args.split(maxsplit=1)
    if len(a) < 2 or not a[0].lstrip("-").isdigit():
        return await ctx.edit("Формат: <code>.caesar 3 привет</code> (расшифровка: <code>.caesar -3 тулезх</code>)")
    await ctx.edit(html.escape(_caesar(a[1], int(a[0]))))


@command("tobin", section="text", usage="[текст]", help="текст → двоичный код")
async def tobin(ctx):
    t = ctx.text_arg()
    await ctx.edit(f"<code>{' '.join(f'{b:08b}' for b in t.encode()[:300])}</code>" if t else "Формат: <code>.tobin hi</code>")


@command("frombin", section="text", usage="[двоичный код]", help="двоичный код → текст")
async def frombin(ctx):
    bits = re.sub(r"[^01]", "", ctx.text_arg())
    if not bits or len(bits) % 8:
        return await ctx.edit("Формат: <code>.frombin 01101000 01101001</code>")
    try:
        await ctx.edit(html.escape(bytes(int(bits[i:i + 8], 2) for i in range(0, len(bits), 8)).decode()))
    except UnicodeDecodeError:
        await ctx.edit("⚠️ Это не похоже на текст в UTF-8")


@command("lorem", section="text", usage="[слов]", help="текст-заполнитель lorem ipsum")
async def lorem(ctx):
    words = ("lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua "
             "ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat").split()
    n = ctx.limit(int(ctx.args), 200) if ctx.args.isdigit() and int(ctx.args) > 0 else 30
    out = " ".join(random.choice(words) for _ in range(n)).capitalize() + "."
    await ctx.edit(out[:4000])
