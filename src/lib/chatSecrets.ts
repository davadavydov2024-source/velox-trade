// Распознавание "секретов" в тексте чата: пароли, коды, логин:пароль. Такие значения
//  - в самом чате прячутся за кнопкой "показать" (и в DOM не лежат, пока не нажата),
//  - в превью, push, email и Telegram-уведомлениях заменяются на ••••, чтобы пароль не оседал в
//    истории уведомлений телефона, почте или Telegram.

const L = "(?<![\\p{L}\\p{N}])";
const SEP = "\\s*(?:от\\s+\\S+\\s*)?(?:[:=\\-—]|is|это)?\\s*";
// Слова, после которых почти всегда идёт секрет — прячем любое значение.
const STRONG = "парол[ьяеюи]|пасс?ворд|password|passwd|pwd";
// Слова, которые бывают и в обычной речи ("код пришёл") — прячем, только если значение с цифрой/символом.
const WEAK = "код(?:\\s+(?:подтверждения|из\\s+смс|из\\s+почты|входа))?|pass|2fa|секрет(?:ный\\s+ключ)?|токен|token|cookie|куки|ключ";
const HAS_DIGIT_OR_SYMBOL = "(?=\\S*[\\d!@#$%^&*_+=~-])";

/** Группы: (1,2) сильное слово + значение; (3,4) слабое слово + значение; (5) пара логин:пароль. */
export const SECRET_RE_SOURCE =
  `(${L}(?:${STRONG})${SEP})(\\S{3,})` +
  `|(${L}(?:${WEAK})${SEP})(${HAS_DIGIT_OR_SYMBOL}\\S{3,})` +
  `|((?<![\\p{L}\\p{N}@.])\\p{L}[\\w.+-]{2,}(?:@[\\w.-]+)?:(?!\\/)(?=[^\\s:]*[\\d!@#$%^&*_])[^\\s:]{4,})`;

export function secretRegex(): RegExp {
  return new RegExp(SECRET_RE_SOURCE, "giu");
}

/** Разбор совпадения: слово-подсказка (остаётся видимым) и сам секрет. */
export function splitSecretMatch(m: RegExpExecArray): { prefix: string; value: string } {
  if (m[1] !== undefined) return { prefix: m[1], value: m[2] };
  if (m[3] !== undefined) return { prefix: m[3], value: m[4] };
  return { prefix: "", value: m[5] };
}

/** Заменяет значения секретов на •••• (ключевое слово остаётся: "пароль: ••••"). */
export function maskSecrets(text: string): string {
  return text.replace(secretRegex(), (...args) => {
    const m = args.slice(0, 6) as unknown as RegExpExecArray;
    return `${splitSecretMatch(m).prefix}••••`;
  });
}
