import { randomInt } from "crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";

/**
 * Журнал операций MiliGram: у каждой операции (пополнение, подарок, передача, покупка, платное сообщение…)
 * есть свой код вида MG-7K3Q-9XPD. Пользователь видит код в «Кошельке» и может отправить его админу —
 * админ по коду видит время, кто и кому отправил, сумму и детали (помогает разбирать обман).
 * Документ лежит в miliOps/{код}; клиентам коллекция недоступна — читают только админ-роуты (Admin SDK).
 */
export const OPS_COLLECTION = "miliOps";

/** Без похожих символов (0/O, 1/I/L), чтобы код легко диктовать и переписывать. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function newOpCode(): string {
  const part = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(0, ALPHABET.length)]).join("");
  return `MG-${part()}-${part()}`;
}

/** «mg 7k3q9xpd», «MG-7K3Q-9XPD» → «MG-7K3Q-9XPD». Не похоже на код — null. */
export function normalizeOpCode(raw: string): string | null {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = /^MG([A-Z0-9]{4})([A-Z0-9]{4})$/.exec(s);
  return m ? `MG-${m[1]}-${m[2]}` : null;
}

export interface OpDoc {
  code: string;
  type: string;
  at: number;
  from: string | null; // кто платит / отправляет (uid); null — платёжная система или сам MiliGram
  to: string | null; // кто получает (uid); null — магазин / система
  amount: number; // сумма в 🪙 (для передачи подарка без монет — 0)
  ref?: string; // что именно: id подарка, заказ оплаты, @юзернейм, id чата…
  name?: string; // человекочитаемо: название подарка, @юзернейм…
  extra?: Record<string, unknown>; // детали (комиссия, анонимность, сумма в ₽ и т.п.)
}

export type OpInput = Omit<OpDoc, "code" | "at"> & { at?: number };
export interface WalletEntry { uid: string; delta: number; type: string; ref?: string; name?: string; at?: number }

const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** В транзакции: записывает операцию miliOps/{код}. Возвращает код. */
export function recordOp(db: Firestore, tx: Transaction, op: OpInput, code = newOpCode()): string {
  const doc: OpDoc = { code, type: op.type, at: op.at ?? Date.now(), from: op.from ?? null, to: op.to ?? null, amount: op.amount };
  if (op.ref !== undefined) doc.ref = op.ref;
  if (op.name) doc.name = op.name;
  if (op.extra) doc.extra = clean(op.extra);
  tx.set(db.collection(OPS_COLLECTION).doc(code), doc);
  return code;
}

/** В транзакции: операция + строки журнала кошелька (у каждой тот же код). Возвращает код. */
export function ledger(db: Firestore, tx: Transaction, op: OpInput, entries: WalletEntry[] = [], code = newOpCode()): string {
  recordOp(db, tx, op, code);
  const at = op.at ?? Date.now();
  for (const e of entries) {
    tx.set(db.collection("miliWalletLog").doc(), clean({ uid: e.uid, delta: e.delta, type: e.type, ref: e.ref, name: e.name || undefined, code, at: e.at ?? at }));
  }
  return code;
}

export const OP_TYPE_LABEL: Record<string, string> = {
  topup: "Пополнение", gift_send: "Подарок отправлен", gift_transfer: "Подарок передан", gift_sale: "Продажа подарка", gift_convert: "Подарок обменян на монеты",
  gift_upgrade: "Улучшение подарка до NFT", paid_message: "Платное сообщение", paid_message_refund: "Возврат за сообщение", admin_grant: "Начисление от администрации",
  frame_buy: "Покупка рамки", purchase: "Покупка", bot_host: "Хостинг бота", username_buy: "Покупка юзернейма", username_sale: "Продажа юзернейма", username_rent: "Аренда юзернейма",
};
