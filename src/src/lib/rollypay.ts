import crypto from "crypto";

const ROLLYPAY_API_KEY = process.env.ROLLYPAY_API_KEY;
const ROLLYPAY_TERMINAL_ID = process.env.ROLLYPAY_TERMINAL_ID;
const ROLLYPAY_SIGNING_SECRET = process.env.ROLLYPAY_SIGNING_SECRET;
const BASE_URL = "https://rollypay.io";

/** Платёж, ещё не подтверждённый как оплаченный, считаем просроченным через это время. */
export const ROLLYPAY_PENDING_TIMEOUT_MS = 20 * 60 * 1000; // 20 минут

export class RollyPayError extends Error {}

function nonce(): string {
  return crypto.randomUUID();
}

interface CreatePaymentResult {
  paymentId: string;
  payUrl: string;
}

export async function rollyCreatePayment(params: {
  amount: number;
  orderId: string;
  description?: string;
  redirectUrl?: string;
}): Promise<CreatePaymentResult> {
  if (!ROLLYPAY_API_KEY) throw new RollyPayError("ROLLYPAY_API_KEY не задан на сервере");

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/v1/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": ROLLYPAY_API_KEY,
        "X-Nonce": nonce(),
      },
      body: JSON.stringify({
        amount: params.amount.toFixed(2),
        payment_currency: "RUB",
        order_id: params.orderId,
        description: params.description,
        ...(ROLLYPAY_TERMINAL_ID ? { terminal_id: ROLLYPAY_TERMINAL_ID } : {}),
        ...(params.redirectUrl ? { redirect_url: params.redirectUrl } : {}),
      }),
    });
  } catch {
    throw new RollyPayError("Не удалось связаться с RollyPay");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.pay_url) {
    const msg = (data && (data.message || data.error)) || `RollyPay: ошибка создания платежа (HTTP ${res.status})`;
    throw new RollyPayError(msg);
  }

  return { paymentId: data.payment_id, payUrl: data.pay_url };
}

interface PaymentInfo {
  paymentId: string;
  orderId: string;
  amount: string;
  status: string;
}

/**
 * Независимая проверка статуса платежа через сам RollyPay (не доверяем только вебхуку —
 * это защита от поддельных/повторных колбэков).
 */
export async function rollyGetPayment(paymentId: string): Promise<PaymentInfo> {
  if (!ROLLYPAY_API_KEY) throw new RollyPayError("ROLLYPAY_API_KEY не задан на сервере");

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { "X-API-Key": ROLLYPAY_API_KEY, "X-Nonce": nonce() },
    });
  } catch {
    throw new RollyPayError("Не удалось связаться с RollyPay");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.payment_id) {
    const msg = (data && (data.message || data.error)) || `RollyPay: платёж не найден (HTTP ${res.status})`;
    throw new RollyPayError(msg);
  }

  return { paymentId: data.payment_id, orderId: data.order_id, amount: data.amount, status: data.status };
}

/**
 * Проверка подписи вебхука RollyPay: HMAC-SHA256("timestamp.body", signing_secret) в заголовке
 * X-Signature (метка времени приходит в X-Timestamp). Плюс защита от replay-атаки — колбэк
 * старше 5 минут не принимается.
 */
export function rollyVerifyWebhookSignature(rawBody: string, timestamp: string | null, signature: string | null): boolean {
  if (!ROLLYPAY_SIGNING_SECRET || !timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 5 * 60) return false;

  const expected = crypto.createHmac("sha256", ROLLYPAY_SIGNING_SECRET).update(`${timestamp}.${rawBody}`).digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const gotBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== gotBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, gotBuf);
}
