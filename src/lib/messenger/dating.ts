import { FieldValue, type Query } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { dmChatId, postMessage, type MessengerAuth } from "./server";
import type { MessengerAccount, MessengerChat } from "./types";

/**
 * Официальный бот знакомств «Velox Знакомства» (@velox_dating).
 * Только для совершеннолетних (18+). Работает как диалог: пользователь отвечает текстом или нажимает быстрые кнопки (kb),
 * бот отвечает сообщениями в личном чате. Состояние — в Firestore: datingProfiles, datingState, datingSeen, datingLikes, datingReports.
 */
export const DATING_UID = "velox_dating";
export const DATING_HANDLE = "velox_dating";
export const MIN_AGE = 18;
const REPORTS_TO_HIDE = 3;

type Gender = "m" | "f";
type Seek = "m" | "f" | "any";
type Goal = "love" | "friends" | "talk";
const GOALS: Record<Goal, string> = { love: "💞 Отношения", friends: "👫 Дружба", talk: "💬 Общение" };
interface Profile { uid: string; name: string; age: number; gender: Gender; seek: Seek; goal: Goal; photo?: string | null; city: string; about: string; active: boolean; createdAt: number; reports?: number }
interface State { step: string; draft?: Partial<Profile>; viewing?: string | null }
interface Reply { text: string; kb?: string[]; image?: string }

const B = {
  start: "💘 Создать анкету", browse: "🔍 Смотреть анкеты", mine: "👤 Моя анкета", edit: "✏️ Заполнить заново", hide: "⏸ Скрыть анкету", show: "▶️ Показать анкету",
  likes: "❤️ Кто меня лайкнул", like: "❤️ Нравится", skip: "👎 Дальше", report: "🚩 Пожаловаться", menu: "🏠 Меню", reset: "🔄 Показать заново",
  m: "Парень", f: "Девушка", seekM: "Парней", seekF: "Девушек", seekAny: "Всех", goalSwitch: "🎯 Что ищу", photoProfile: "📷 Фото из профиля", noPhoto: "Без фото", editPhoto: "🖼 Сменить фото", editText: "📝 Изменить текст", del: "🗑 Удалить анкету", yes: "Да, удалить", no: "Отмена",
};

export async function ensureDatingBot(): Promise<MessengerAuth> {
  const db = adminDb();
  const ref = db.collection("messengerAccounts").doc(DATING_UID);
  let account = (await ref.get()).data() as MessengerAccount | undefined;
  if (!account) {
    const now = Date.now();
    account = { uid: DATING_UID, handle: DATING_HANDLE, displayName: "Velox Знакомства", photoURL: null, bio: "Официальный бот знакомств. Только 18+", createdAt: now, lastSeenAt: now, showLastSeen: false, banned: false, verified: true, privacy: { whoCanMessage: "everyone", whoCanAddToGroups: "nobody" } };
    await ref.set(account);
    await db.collection("messengerHandles").doc(DATING_HANDLE).set({ uid: DATING_UID }, { merge: true });
  }
  return { uid: DATING_UID, account };
}

/** Личный чат пользователя с ботом (создаётся при первом обращении). */
export async function ensureDatingChat(uid: string): Promise<MessengerChat> {
  const ref = adminDb().collection("messengerChats").doc(dmChatId(DATING_UID, uid));
  let snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ type: "dm", members: [DATING_UID, uid], admins: [], createdBy: DATING_UID, updatedAt: Date.now(), readBy: {}, pinnedMessageIds: [] });
    snap = await ref.get();
  }
  return { id: ref.id, ...snap.data() } as MessengerChat;
}

async function say(uid: string, r: Reply, silent = false) {
  const bot = await ensureDatingBot();
  const chat = await ensureDatingChat(uid);
  const kb = r.kb?.length ? { kb: r.kb } : {};
  if (r.image) await postMessage({ chat, sender: bot, kind: "image", text: r.text.slice(0, 900), mediaUrl: r.image, extra: kb, silent });
  else await postMessage({ chat, sender: bot, kind: "text", text: r.text.slice(0, 3900), extra: kb, silent });
}

const col = (n: string) => adminDb().collection(n);
const sexWord = (g: Gender) => (g === "m" ? "парень" : "девушка");
const cardText = (p: Profile) => `${p.name}, ${p.age} · ${p.city}\n${sexWord(p.gender)} · ${GOALS[p.goal] ?? ""}${p.about ? `\n\n${p.about}` : ""}`;

const INTRO = `💘 Velox Знакомства\n\nЗдесь можно найти людей по интересам и симпатии. Бот только для тех, кому есть 18 лет.\n\nПравила: будьте вежливы, не отправляйте чужие фото, не переводите деньги незнакомцам и на первой встрече выбирайте людное место. На анкету можно пожаловаться — после нескольких жалоб она скрывается.`;

/** Фото анкеты: загруженное в боте, иначе фото профиля. */
async function photoOf(p: Profile): Promise<string | undefined> {
  if (p.photo) return p.photo;
  const acc = (await col("messengerAccounts").doc(p.uid).get()).data() as MessengerAccount | undefined;
  return acc?.photoURL && /^https?:\/\//.test(acc.photoURL) ? acc.photoURL : undefined;
}

async function finishProfile(uid: string, draft: Partial<Profile>, photo: string | null): Promise<void> {
  const acc = (await col("messengerAccounts").doc(uid).get()).data() as MessengerAccount | undefined;
  const old = (await col("datingProfiles").doc(uid).get()).data() as Profile | undefined;
  const p: Profile = { uid, name: (acc?.displayName ?? "Без имени").slice(0, 30), age: draft.age!, gender: draft.gender!, seek: draft.seek!, goal: draft.goal ?? "love", photo, city: draft.city!, about: draft.about!, active: true, createdAt: old?.createdAt ?? Date.now(), reports: old?.reports ?? 0 };
  await col("datingProfiles").doc(uid).set(p);
  await col("datingState").doc(uid).set({ step: "idle", draft: {}, viewing: null });
  await say(uid, { text: `Анкета готова ✅\n\n${cardText(p)}`, image: await photoOf(p), kb: await menuFor(uid) });
}

/** Фото, присланное боту: сохраняем, если сейчас шаг загрузки фото. */
export async function datingPhoto(uid: string, url: string): Promise<void> {
  const st = ((await col("datingState").doc(uid).get()).data() as State | undefined) ?? { step: "idle" };
  if (st.step === "photo") return finishProfile(uid, st.draft ?? {}, url);
  if (st.step === "photo-only") {
    await col("datingProfiles").doc(uid).update({ photo: url });
    await col("datingState").doc(uid).set({ step: "idle" }, { merge: true });
    return say(uid, { text: "Фото обновлено ✅", image: url, kb: await menuFor(uid) });
  }
  return say(uid, { text: "Фото принимаю при создании анкеты или после «🖼 Сменить фото».", kb: await menuFor(uid) });
}

async function menuFor(uid: string): Promise<string[]> {
  const p = (await col("datingProfiles").doc(uid).get()).data() as Profile | undefined;
  if (!p) return [B.start];
  return [B.browse, B.mine, B.likes, B.goalSwitch, p.active ? B.hide : B.show, B.edit];
}

/** Вход: приветствие (при /start и первом обращении). */
export async function datingGreeting(uid: string): Promise<void> {
  const exists = (await col("datingProfiles").doc(uid).get()).exists;
  await say(uid, exists ? { text: "С возвращением! Что делаем?", kb: await menuFor(uid) } : { text: INTRO + "\n\nСоздадим анкету? Это займёт минуту.", kb: [B.start] }, true);
}

async function nextCandidate(me: Profile): Promise<Profile | null> {
  const seenDoc = (await col("datingSeen").doc(me.uid).get()).data();
  const seen = new Set<string>((seenDoc?.ids as string[] | undefined) ?? []);
  let q = col("datingProfiles").where("active", "==", true) as Query;
  if (me.seek !== "any") q = q.where("gender", "==", me.seek);
  const snap = await q.limit(200).get();
  const pool = snap.docs.map((d) => d.data() as Profile).filter((p) => p.uid !== me.uid && !seen.has(p.uid) && (p.seek === "any" || p.seek === me.gender) && p.goal === me.goal);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function markSeen(uid: string, other: string) {
  const ref = col("datingSeen").doc(uid);
  await ref.set({ ids: FieldValue.arrayUnion(other) }, { merge: true });
}

async function showNext(me: Profile, uid: string): Promise<Reply> {
  const c = await nextCandidate(me);
  await col("datingState").doc(uid).set({ step: "browse", viewing: c?.uid ?? null }, { merge: true });
  if (!c) return { text: "Подходящие анкеты закончились. Попробуйте сменить цель («🎯 Что ищу») или загляните позже.", kb: [B.reset, B.menu] };
  return { text: cardText(c), image: await photoOf(c), kb: [B.like, B.skip, B.report, B.menu] };
}

async function likeBack(uid: string, target: string): Promise<boolean> {
  return (await col("datingLikes").doc(`${target}_${uid}`).get()).exists;
}

async function notifyMatch(a: string, b: string) {
  const [pa, pb, aa, ab] = await Promise.all([col("datingProfiles").doc(a).get(), col("datingProfiles").doc(b).get(), col("messengerAccounts").doc(a).get(), col("messengerAccounts").doc(b).get()]);
  const nameA = (pa.data() as Profile | undefined)?.name ?? "Кто-то", nameB = (pb.data() as Profile | undefined)?.name ?? "Кто-то";
  const hA = (aa.data() as MessengerAccount | undefined)?.handle, hB = (ab.data() as MessengerAccount | undefined)?.handle;
  await Promise.all([
    say(a, { text: `💞 Взаимная симпатия!\n${nameB} тоже поставил(а) вам «нравится».\n\nНапишите первым: @${hB}`, kb: [B.browse, B.menu] }),
    say(b, { text: `💞 Взаимная симпатия!\n${nameA} тоже поставил(а) вам «нравится».\n\nНапишите первым: @${hA}`, kb: [B.browse, B.menu] }),
  ]);
}

/** Обработка сообщения пользователя боту. */
export async function datingHandle(uid: string, rawText: string): Promise<void> {
  const text = rawText.trim();
  const profRef = col("datingProfiles").doc(uid), stRef = col("datingState").doc(uid);
  const [ps, ss] = await Promise.all([profRef.get(), stRef.get()]);
  const prof = ps.data() as Profile | undefined;
  const st = (ss.data() as State | undefined) ?? { step: "idle" };

  if (text === "/start" || text === B.menu) { await stRef.set({ step: "idle", draft: {}, viewing: null }); return datingGreeting(uid); }

  // ---- создание анкеты ----
  if (text === B.start || text === B.edit) {
    await stRef.set({ step: "age", draft: {}, viewing: null });
    return say(uid, { text: `Сколько вам лет? (только ${MIN_AGE}+)` });
  }
  if (st.step === "age") {
    const age = Number(text.replace(/\D/g, ""));
    if (!Number.isInteger(age) || age < MIN_AGE) return say(uid, { text: age && age < MIN_AGE ? `Бот доступен только с ${MIN_AGE} лет. Анкету создать нельзя.` : "Введите возраст числом, например 24." });
    if (age > 99) return say(uid, { text: "Введите настоящий возраст." });
    await stRef.set({ step: "gender", draft: { age } });
    return say(uid, { text: "Ваш пол?", kb: [B.m, B.f] });
  }
  if (st.step === "gender") {
    const g: Gender | null = text === B.m ? "m" : text === B.f ? "f" : null;
    if (!g) return say(uid, { text: "Выберите кнопкой.", kb: [B.m, B.f] });
    await stRef.set({ step: "seek", draft: { ...st.draft, gender: g } });
    return say(uid, { text: "Кого ищете?", kb: [B.seekM, B.seekF, B.seekAny] });
  }
  if (st.step === "seek") {
    const s: Seek | null = text === B.seekM ? "m" : text === B.seekF ? "f" : text === B.seekAny ? "any" : null;
    if (!s) return say(uid, { text: "Выберите кнопкой.", kb: [B.seekM, B.seekF, B.seekAny] });
    await stRef.set({ step: "goal", draft: { ...st.draft, seek: s } });
    return say(uid, { text: "Что ищете?", kb: Object.values(GOALS) });
  }
  if (st.step === "goal") {
    const g = (Object.keys(GOALS) as Goal[]).find((k) => GOALS[k] === text);
    if (!g) return say(uid, { text: "Выберите кнопкой.", kb: Object.values(GOALS) });
    await stRef.set({ step: "city", draft: { ...st.draft, goal: g } });
    return say(uid, { text: "Из какого вы города?" });
  }
  if (st.step === "goal-only") {
    const g = (Object.keys(GOALS) as Goal[]).find((k) => GOALS[k] === text);
    if (!g) return say(uid, { text: "Выберите кнопкой.", kb: Object.values(GOALS) });
    await Promise.all([profRef.update({ goal: g }), col("datingSeen").doc(uid).delete(), stRef.set({ step: "idle" }, { merge: true })]);
    return say(uid, { text: `Теперь ищете: ${GOALS[g]}. Показываю анкеты с такой же целью.`, kb: await menuFor(uid) });
  }
  if (st.step === "city") {
    if (text.length < 2 || text.length > 40) return say(uid, { text: "Название города — от 2 до 40 символов." });
    await stRef.set({ step: "about", draft: { ...st.draft, city: text } });
    return say(uid, { text: "Расскажите о себе в паре предложений (до 300 символов). Контакты и ссылки указывать не нужно — связь будет через бота." });
  }
  if (st.step === "about") {
    if (text.length < 5 || text.length > 300) return say(uid, { text: "Напишите от 5 до 300 символов." });
    if (/(https?:\/\/|t\.me|@\w{4,}|\+?\d[\d\s\-()]{8,})/i.test(text)) return say(uid, { text: "Уберите ссылки, @ники и номера телефонов — обменяться контактами можно после взаимной симпатии." });
    await stRef.set({ step: "photo", draft: { ...st.draft, about: text } });
    return say(uid, { text: "Пришлите своё фото (как обычное фото в этом чате) или выберите кнопку.", kb: [B.photoProfile, B.noPhoto] });
  }
  if (st.step === "photo") {
    if (text === B.photoProfile) {
      const acc = (await col("messengerAccounts").doc(uid).get()).data() as MessengerAccount | undefined;
      return finishProfile(uid, st.draft ?? {}, acc?.photoURL && /^https?:\/\//.test(acc.photoURL) ? acc.photoURL : null);
    }
    if (text === B.noPhoto) return finishProfile(uid, st.draft ?? {}, null);
    return say(uid, { text: "Пришлите фото или нажмите кнопку.", kb: [B.photoProfile, B.noPhoto] });
  }
  if (st.step === "about-only") {
    if (text.length < 5 || text.length > 300) return say(uid, { text: "Напишите от 5 до 300 символов." });
    if (/(https?:\/\/|t\.me|@\w{4,}|\+?\d[\d\s\-()]{8,})/i.test(text)) return say(uid, { text: "Уберите ссылки, @ники и номера телефонов." });
    await Promise.all([profRef.update({ about: text }), stRef.set({ step: "idle" }, { merge: true })]);
    return say(uid, { text: "Текст анкеты обновлён ✅", kb: await menuFor(uid) });
  }

  if (!prof) return say(uid, { text: "Сначала создайте анкету.", kb: [B.start] });

  // ---- меню ----
  if (text === B.mine) {
    return say(uid, { text: `${cardText(prof)}\n\nСтатус: ${prof.active ? "показывается" : "скрыта"}`, image: await photoOf(prof), kb: [B.editPhoto, B.editText, B.goalSwitch, ...(await menuFor(uid)).filter((k) => k !== B.mine && k !== B.goalSwitch), B.del] });
  }
  if (text === B.editPhoto) { await stRef.set({ step: "photo-only" }, { merge: true }); return say(uid, { text: "Пришлите новое фото." }); }
  if (text === B.editText) { await stRef.set({ step: "about-only" }, { merge: true }); return say(uid, { text: "Напишите новый текст анкеты (5–300 символов)." }); }
  if (text === B.goalSwitch) { await stRef.set({ step: "goal-only" }, { merge: true }); return say(uid, { text: "Что ищете?", kb: Object.values(GOALS) }); }
  if (text === B.hide || text === B.show) {
    await profRef.update({ active: text === B.show });
    return say(uid, { text: text === B.show ? "Анкета снова показывается ▶️" : "Анкета скрыта ⏸ — вас никто не увидит, пока не включите её обратно.", kb: await menuFor(uid) });
  }
  if (text === B.del) { await stRef.set({ step: "confirm-del" }, { merge: true }); return say(uid, { text: "Удалить анкету безвозвратно?", kb: [B.yes, B.no] }); }
  if (st.step === "confirm-del") {
    if (text === B.yes) { await Promise.all([profRef.delete(), stRef.delete()]); return say(uid, { text: "Анкета удалена. Если захотите вернуться — создайте новую.", kb: [B.start] }); }
    await stRef.set({ step: "idle" }, { merge: true });
    return say(uid, { text: "Отменено.", kb: await menuFor(uid) });
  }
  if (text === B.reset) await col("datingSeen").doc(uid).delete();
  if (text === B.browse || text === B.reset) {
    if (!prof.active) return say(uid, { text: "Ваша анкета скрыта. Включите её, чтобы смотреть других.", kb: await menuFor(uid) });
    return say(uid, await showNext(prof, uid));
  }
  if (text === B.likes) {
    const snap = await col("datingLikes").where("to", "==", uid).limit(30).get();
    const mine = new Set(((await col("datingSeen").doc(uid).get()).data()?.ids as string[] | undefined) ?? []);
    const ids = snap.docs.map((d) => d.data().from as string).filter((id) => !mine.has(id));
    if (!ids.length) return say(uid, { text: "Новых лайков пока нет. Загляните позже или смотрите анкеты — взаимность появится быстрее.", kb: await menuFor(uid) });
    await stRef.set({ step: "browse", viewing: ids[0] }, { merge: true });
    const p = (await col("datingProfiles").doc(ids[0]).get()).data() as Profile | undefined;
    if (!p || !p.active) { await markSeen(uid, ids[0]); return say(uid, { text: "Эта анкета больше недоступна.", kb: await menuFor(uid) }); }
    return say(uid, { text: `❤️ Вас лайкнули!\n\n${cardText(p)}`, kb: [B.like, B.skip, B.report, B.menu] });
  }

  // ---- действия над текущей анкетой ----
  if (st.step === "browse" && st.viewing && (text === B.like || text === B.skip || text === B.report)) {
    const target = st.viewing;
    await markSeen(uid, target);
    if (text === B.like) {
      await col("datingLikes").doc(`${uid}_${target}`).set({ from: uid, to: target, at: Date.now() });
      if (await likeBack(uid, target)) await notifyMatch(uid, target);
      else await say(target, { text: "❤️ Кому-то понравилась ваша анкета! Загляните в «Кто меня лайкнул».", kb: await menuFor(target) });
    } else if (text === B.report) {
      const rid = `${uid}_${target}`;
      const rr = col("datingReports").doc(rid);
      if (!(await rr.get()).exists) {
        await rr.set({ from: uid, target, at: Date.now() });
        const n = ((await col("datingProfiles").doc(target).get()).data()?.reports as number | undefined) ?? 0;
        await col("datingProfiles").doc(target).update({ reports: n + 1, ...(n + 1 >= REPORTS_TO_HIDE ? { active: false } : {}) }).catch(() => {});
      }
      await say(uid, { text: "Спасибо, жалоба отправлена. Эту анкету вы больше не увидите." });
    }
    return say(uid, await showNext(prof, uid));
  }

  return say(uid, { text: "Выберите действие кнопкой ниже 👇", kb: await menuFor(uid) });
}
