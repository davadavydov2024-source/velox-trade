/** «Тихие часы»: в это время пуш-уведомления не приходят (кроме упоминаний). Время считается по часовому поясу пользователя. */
export interface QuietHours { enabled: boolean; from: number; to: number; tz: number } // from/to — минуты от полуночи, tz — смещение от UTC в минутах

export function cleanQuiet(b: any): QuietHours | null {
  const m = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1440 ? (v as number) : null);
  const from = m(b?.from), to = m(b?.to);
  const tz = Number.isInteger(b?.tz) && Math.abs(b.tz) <= 14 * 60 ? b.tz : 0;
  if (from === null || to === null) return null;
  return { enabled: b?.enabled === true, from, to, tz };
}

export function inQuietHours(q: Partial<QuietHours> | null | undefined, now: number): boolean {
  if (!q?.enabled || typeof q.from !== "number" || typeof q.to !== "number") return false;
  const local = Math.floor((now + (q.tz ?? 0) * 60_000) / 60_000) % 1440;
  const t = (local + 1440) % 1440;
  if (q.from === q.to) return false;
  return q.from < q.to ? t >= q.from && t < q.to : t >= q.from || t < q.to; // окно через полночь: 23:00–08:00
}
