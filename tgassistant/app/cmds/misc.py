import html
import math
import random
import statistics

from .. import subtools
from ..registry import command
from .extra import _json

BORED = ["Позвони другу, с которым давно не общались.", "Разбери один ящик или полку.", "Выучи 5 слов на иностранном языке.",
         "Прогуляйся 20 минут без телефона.", "Приготовь что-нибудь новое.", "Напиши план на неделю.", "Сделай 20 приседаний.",
         "Посмотри фильм, который давно откладывал(а).", "Нарисуй что-нибудь за 5 минут.", "Составь плейлист на вечер."]
WYR = [("Всегда быть опоздавшим", "Всегда приходить слишком рано"), ("Уметь летать", "Уметь становиться невидимым"),
       ("Жить на море", "Жить в горах"), ("Больше времени", "Больше денег"), ("Знать все языки", "Уметь играть на любом инструменте"),
       ("Путешествовать в прошлое", "Заглянуть в будущее"), ("Зимой всегда лето", "Летом всегда зима")]
FORTUNES = ["Скоро тебя ждёт приятный сюрприз.", "Маленький шаг сегодня — большой результат завтра.", "Кто-то думает о тебе тепло.",
            "Ты на правильном пути, не сворачивай.", "Удача любит тех, кто пробует.", "Хорошие новости уже в дороге.",
            "Сегодня лучше довериться чутью."]
NATO = dict(zip("abcdefghijklmnopqrstuvwxyz", "Alfa Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett Kilo Lima Mike November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey X-ray Yankee Zulu".split()))
LEET = str.maketrans("aeiostlbgAEIOSTLBG", "4310571869" + "431057186"[:8])
UPSIDE = dict(zip("abcdefghijklmnopqrstuvwxyz", "ɐqɔpǝɟƃɥᴉɾʞlɯuodbɹsʇnʌʍxʎz"))
UPSIDE.update({"1": "Ɩ", "2": "ᄅ", "3": "Ɛ", "4": "ㄣ", "5": "ϛ", "6": "9", "7": "ㄥ", "8": "8", "9": "6", "0": "0", ".": "˙", ",": "'", "?": "¿", "!": "¡"})


# ---------- аккаунт ----------
@command("mysub", section="manage", help="мои подписки (ответ придёт вам в личку с ботом)")
async def mysub(ctx):
    from .. import db
    act = await subtools.describe(ctx.owner_id)
    t = await db.get_tier(ctx.owner_id)
    text = f"💎 <b>Ваши подписки</b>\n{act}\nДействующий тариф: <b>{['FREE', 'PREMIUM', 'VIP'][t]}</b>\nПродлить или купить: /tariffs"
    try:
        await ctx.bot.send_message(ctx.owner_id, text)
        await ctx.delete_cmd()
    except Exception:
        await ctx.edit("⚠️ Бот не может написать вам в личку — откройте бота и нажмите /start")


# ---------- картинки из сети ----------
async def _photo_from(ctx, url, key):
    d = await _json(url)
    await ctx.bot.send_photo(ctx.chat_id, d[key], **ctx.bc)
    await ctx.delete_cmd()


@command("dog", section="fun", help="случайное фото собаки")
async def dog(ctx):
    await _photo_from(ctx, "https://dog.ceo/api/breeds/image/random", "message")


@command("fox", section="fun", help="случайное фото лисы")
async def fox(ctx):
    await _photo_from(ctx, "https://randomfox.ca/floof/", "image")


# ---------- общение ----------
@command("bored", section="fun", help="чем заняться, если скучно")
async def bored(ctx):
    await ctx.edit(f"🥱 {random.choice(BORED)}")


@command("wyr", section="fun", help="«что выберешь»: вопрос для игры")
async def wyr(ctx):
    a, b = random.choice(WYR)
    await ctx.edit(f"🤔 <b>Что выберешь?</b>\n🅰️ {a}\n🅱️ {b}")


@command("fortune", section="fun", help="предсказание из печенья 🥠")
async def fortune(ctx):
    await ctx.edit(f"🥠 {random.choice(FORTUNES)}")


# ---------- числа ----------
def _nums(ctx):
    try:
        return [float(x.replace(",", ".")) for x in ctx.args.replace(";", " ").split()]
    except ValueError:
        return []


@command("split", section="fun", usage="[сумма] [человек] [чаевые %]", help="поделить счёт: .split 3000 4 10")
async def split(ctx):
    n = _nums(ctx)
    if len(n) < 2 or n[1] < 1:
        return await ctx.edit("Формат: <code>.split 3000 4 10</code> (сумма, человек, чаевые %)")
    total = n[0] * (1 + (n[2] if len(n) > 2 else 0) / 100)
    await ctx.edit(f"🧾 Итого: <b>{total:.2f}</b>\nС каждого из {int(n[1])}: <b>{total / n[1]:.2f}</b>")


@command("tip", section="fun", usage="[сумма] [%]", help="чаевые: .tip 1500 10")
async def tip(ctx):
    n = _nums(ctx)
    if not n:
        return await ctx.edit("Формат: <code>.tip 1500 10</code>")
    pct = n[1] if len(n) > 1 else 10
    await ctx.edit(f"💵 Чаевые {pct:g}%: <b>{n[0] * pct / 100:.2f}</b> · всего <b>{n[0] * (1 + pct / 100):.2f}</b>")


@command("avg", section="fun", usage="[числа]", help="сумма, среднее, медиана, минимум и максимум")
async def avg(ctx):
    n = _nums(ctx)
    if not n:
        return await ctx.edit("Формат: <code>.avg 5 3 9 1</code>")
    await ctx.edit(f"📊 Сумма: <b>{sum(n):g}</b> · среднее: <b>{sum(n) / len(n):.4g}</b> · медиана: <b>{statistics.median(n):g}</b>\nмин: {min(n):g} · макс: {max(n):g} · чисел: {len(n)}")


@command("gcd", section="fun", usage="[a] [b…]", help="НОД и НОК чисел")
async def gcd(ctx):
    try:
        n = [int(x) for x in ctx.args.split()]
    except ValueError:
        n = []
    if len(n) < 2 or any(x <= 0 for x in n):
        return await ctx.edit("Формат: <code>.gcd 12 18 24</code>")
    g, l = n[0], n[0]
    for x in n[1:]:
        g, l = math.gcd(g, x), l * x // math.gcd(l, x)
    await ctx.edit(f"🔢 НОД: <b>{g}</b> · НОК: <b>{l}</b>")


@command("fibo", section="fun", usage="[N]", help="первые N чисел Фибоначчи (до 60)")
async def fibo(ctx):
    n = min(60, max(1, int(ctx.args))) if ctx.args.isdigit() else 10
    a, b, out = 0, 1, []
    for _ in range(n):
        out.append(a)
        a, b = b, a + b
    await ctx.edit(" ".join(map(str, out)))


@command("factorial", section="fun", usage="[N]", help="факториал (до 500)")
async def factorial(ctx):
    if not ctx.args.isdigit() or int(ctx.args) > 500:
        return await ctx.edit("Формат: <code>.factorial 20</code> (до 500)")
    v = str(math.factorial(int(ctx.args)))
    await ctx.edit(f"{ctx.args}! = <code>{v if len(v) < 3500 else v[:40] + '… (' + str(len(v)) + ' цифр)'}</code>")


# ---------- текст ----------
@command("leet", section="fun", usage="[текст]", help="текст в стиле 1337")
async def leet(ctx):
    t = ctx.text_arg()
    await ctx.edit(html.escape(t.translate(LEET)) if t else "Формат: <code>.leet elite</code>")


@command("upside", section="fun", usage="[текст]", help="ʇǝxʇ вверх ногами (латиница и цифры)")
async def upside(ctx):
    t = ctx.text_arg().lower()
    await ctx.edit(html.escape("".join(UPSIDE.get(c, c) for c in reversed(t))) if t else "Формат: <code>.upside hello</code>")


@command("nato", section="fun", usage="[слово]", help="фонетический алфавит NATO: .nato abc → Alfa Bravo Charlie")
async def nato(ctx):
    t = ctx.text_arg().lower()
    out = " ".join(NATO.get(c, c) for c in t if not c.isspace())
    await ctx.edit(html.escape(out) if out else "Формат: <code>.nato abc</code>")
