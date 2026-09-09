/**
 * Firestore (addDoc/setDoc) бросает "Unsupported field value: undefined", если в объекте есть
 * ключ со значением undefined — это легко случайно получить из формы вида
 * `comment.trim() || undefined` для необязательного поля, которое человек не заполнил.
 * Оборачивай так: addDoc(col, { ...stripUndefined(data), createdAt: Date.now() }).
 */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
