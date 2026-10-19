import asyncio
import html
import random

import aiohttp

from ..registry import command

QUOTES = [
    "Путь в тысячу ли начинается с первого шага.",
    "Упал семь раз — встань восемь.",
    "Делай, что можешь, с тем, что имеешь, там, где ты есть.",
    "Не бойся идти медленно, бойся стоять на месте.",
    "Лучший способ предсказать будущее — создать его.",
    "Дисциплина — это мост между целями и достижениями.",
    "Сделанное лучше идеального.",
    "Ты сильнее, чем думаешь.",
]
JOKES = [
    "— Доктор, я забываю всё через минуту!\n— Давно это у вас?\n— Что «давно»?",
    "Программист ставит на тумбочку два стакана: с водой — если захочет пить, и пустой — если не захочет.",
    "— Почему программисты путают Хэллоуин и Рождество?\n— Потому что Oct 31 == Dec 25.",
    "Купил будильник с функцией «умный». Теперь он сам решает, когда мне вставать.",
    "Заходит улитка в бар. Бармен: «Мест нет». Улитка: «Я подожду».",
]
FATES = [
    "Сегодня удачный день для новых идей ✨",
    "Лучше отложить важное решение до вечера 🕰",
    "Тебя ждёт приятная неожиданность 🎁",
    "Кто-то из прошлого напомнит о себе 📩",
    "День будет спокойным, наслаждайся 🌿",
    "Сегодня стоит довериться интуиции 🔮",
    "Не спеши с ответами — слушай больше 👂",
    "Финансовая удача рядом, но не рискуй зря 💸",
]
TAROT = [
    "Шут — новое начало", "Маг — сила воли", "Верховная жрица — интуиция", "Императрица — изобилие",
    "Колесо Фортуны — перемены", "Сила — внутренняя стойкость", "Звезда — надежда", "Солнце — радость и успех",
    "Луна — иллюзии", "Мир — завершение цикла", "Башня — внезапные перемены", "Влюблённые — выбор",
]
LAUGHS = ["ха", "ахах", "ХАХАХА", "хахахаха))", "ПХАХАХАХ", "ахахахахх", "ыыыы 😂", "АХАХАХАХА", "хех)"]


@command("random", "rnd", section="fun", usage="[min] [max]", help="случайное число")
async def random_(ctx):
    nums = [int(x) for x in ctx.args.split() if x.lstrip("-").isdigit()]
    lo, hi = (nums + [100])[:2] if len(nums) == 1 else ((nums[0], nums[1]) if len(nums) >= 2 else (1, 100))
    if lo > hi:
        lo, hi = hi, lo
    await ctx.edit(f"🎲 {random.randint(lo, hi)} <i>({lo}–{hi})</i>")


@command("flip", "coin", section="fun", help="подбросить монетку (орёл или решка)")
async def flip(ctx):
    await ctx.edit(f"🪙 {random.choice(['Орёл', 'Решка'])}")


@command("magic8", section="fun", usage="[вопрос]", help="магический шар 8")
async def magic8(ctx):
    ans = random.choice([
        "Бесспорно", "Предрешено", "Никаких сомнений", "Определённо да", "Можешь быть уверен",
        "Пока не ясно, попробуй снова", "Спроси позже", "Лучше не рассказывать", "Даже не думай",
        "Мой ответ — нет", "Весьма сомнительно", "Перспективы не очень хорошие",
    ])
    q = f"<i>{html.escape(ctx.args)}</i>\n" if ctx.args else ""
    await ctx.edit(f"🎱 {q}<b>{ans}</b>")


@command("quote", section="fun", help="случайная мотивационная цитата")
async def quote(ctx):
    await ctx.edit(f"💬 <i>{random.choice(QUOTES)}</i>")


@command("rps", section="fun", usage="[выбор]", help="камень, ножницы, бумага")
async def rps(ctx):
    names = {"к": "🪨 камень", "н": "✂️ ножницы", "б": "📄 бумага"}
    my = (ctx.args or "").strip().lower()[:1]
    if my not in names:
        return await ctx.edit("Выбор: <code>.rps камень</code> / ножницы / бумага")
    bot_ = random.choice(list(names))
    if my == bot_:
        res = "Ничья 🤝"
    elif (my, bot_) in {("к", "н"), ("н", "б"), ("б", "к")}:
        res = "Ты выиграл 🎉"
    else:
        res = "Я выиграл 😎"
    await ctx.edit(f"Ты: {names[my]}\nЯ: {names[bot_]}\n<b>{res}</b>")


@command("slot", section="fun", help="игровой автомат 🎰")
async def slot(ctx):
    await ctx.bot.send_dice(ctx.chat_id, emoji="🎰", **ctx.bc)
    await ctx.delete_cmd()


@command("choose", section="fun", usage="[вариант1 | вариант2]", help="случайный выбор")
async def choose(ctx):
    opts = [o.strip() for o in ctx.args.split("|") if o.strip()]
    if len(opts) < 2:
        return await ctx.edit("Формат: <code>.choose пицца | суши</code>")
    await ctx.edit(f"🎯 Выбираю: <b>{html.escape(random.choice(opts))}</b>")


@command("luck", section="fun", help="узнать уровень удачи")
async def luck(ctx):
    n = random.randint(0, 100)
    await ctx.edit(f"🍀 Твоя удача сегодня: <b>{n}%</b>\n{'█' * (n // 10)}{'░' * (10 - n // 10)}")


@command("fate", section="fun", help="предсказать сегодняшний день")
async def fate(ctx):
    await ctx.edit(f"🔮 {random.choice(FATES)}")


@command("гадать", "gadat", section="fun", usage="[имя]", help="гадание на картах")
async def gadat(ctx):
    cards = random.sample(TAROT, 3)
    who = f" для {html.escape(ctx.args)}" if ctx.args else ""
    await ctx.edit(
        f"🃏 <b>Расклад{who}</b>\nПрошлое: {cards[0]}\nНастоящее: {cards[1]}\nБудущее: {cards[2]}"
    )


@command("joke", section="fun", help="случайная шутка")
async def joke(ctx):
    await ctx.edit(f"😄 {random.choice(JOKES)}")


@command("meme", section="fun", help="случайный мем (фото)")
async def meme(ctx):
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as s:
        async with s.get("https://meme-api.com/gimme") as r:
            data = await r.json()
    await ctx.bot.send_photo(ctx.chat_id, data["url"], **ctx.bc)
    await ctx.delete_cmd()


@command("xaxa", section="fun", usage="N", help="смех разными сообщениями (1–20, у админа без лимита)", tier=1)
async def xaxa(ctx):
    n = ctx.limit(max(1, int(ctx.args)), 20) if ctx.args.isdigit() else 5
    await ctx.delete_cmd()
    for _ in range(n):
        await ctx.send_safe(random.choice(LAUGHS))
        await asyncio.sleep(0.4)


@command("bomb", section="fun", usage="N [текст]", help="текст исчезнет через N сек (1–3600)", tier=1)
async def bomb(ctx):
    parts = ctx.args.split(maxsplit=1)
    if len(parts) < 2 or not parts[0].isdigit():
        return await ctx.edit("Формат: <code>.bomb 10 секретный текст</code>")
    n = ctx.limit(max(1, int(parts[0])), 3600)
    await ctx.edit(f"💣 {html.escape(parts[1])}")
    await asyncio.sleep(n)
    await ctx.delete_cmd()
