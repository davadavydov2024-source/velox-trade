const CACTUSPAY_TOKEN = process.env.CACTUSPAY_TOKEN;
const BASE_URL = "https://lk.cactuspay.pro";

export class CactusPayError extends Error {}

interface CreatePaymentResult {
  url: string;
  requestCheck: boolean;
}

export async function cactusCreatePayment(params: {
  amount: number;
  orderId: string;
  description?: string;
  redirectUrl?: string;
}): Promise<CreatePaymentResult> {
  if (!CACTUSPAY_TOKEN) {
    throw new CactusPayError("CACTUSPAY_TOKEN не задан на сервере");
  }

  const res = await fetch(`${BASE_URL}/api/?method=create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: CACTUSPAY_TOKEN,
      amount: params.amount,
      order_id: params.orderId,
      description: params.description,
      redirect_url: params.redirectUrl,
    }),
  });

  const data = await res.json();
  if (data.status !== "success") {
    throw new CactusPayError(typeof data.response === "string" ? data.response : "Ошибка создания платежа");
  }

  return { url: data.response.url, requestCheck: !!data.response.request_check };
}

interface PaymentInfo {
  id: number;
  orderId: string;
  amount: string;
  totalAmount: string;
  status: "ACCEPT" | "WAIT";
  profit: string;
}

/**
 * Независимая проверка статуса платежа через сам CactusPay (не доверяем только вебхуку —
 * так явно рекомендует их документация, это защита от поддельных вебхуков).
 */
export async function cactusGetPayment(orderId: string): Promise<PaymentInfo> {
  if (!CACTUSPAY_TOKEN) {
    throw new CactusPayError("CACTUSPAY_TOKEN не задан на сервере");
  }

  const res = await fetch(`${BASE_URL}/api/?method=get`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: CACTUSPAY_TOKEN, order_id: orderId }),
  });

  const data = await res.json();
  if (data.status !== "success") {
    throw new CactusPayError(typeof data.response === "string" ? data.response : "Платёж не найден");
  }

  return {
    id: data.response.id,
    orderId: data.response.order_id,
    amount: data.response.amount,
    totalAmount: data.response.total_amount,
    status: data.response.status,
    profit: data.response.profit,
  };
}
