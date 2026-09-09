import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/getClientIp";

export const runtime = "nodejs";
// Читает IP из headers запроса — без этого Next пытается пререндерить роут статически при билде.
export const dynamic = "force-dynamic";

const CHECK_TIMEOUT_MS = 4000;

type VpnCheckResult = { blocked: boolean };

/**
 * proxycheck.io не отдаёт CORS-заголовки (Access-Control-Allow-Origin), поэтому браузер не может
 * дёрнуть его напрямую с клиента — запрос падает с "blocked by CORS policy" ещё до того, как уйдёт
 * на сервер proxycheck.io. Обходим это тем, что обычно и является решением проблем с CORS у
 * стороннего API без CORS-поддержки: делаем запрос сервер-сервер отсюда (для серверных запросов
 * CORS не применяется вообще — это ограничение браузера, а не самого API), а клиент (VpnGate)
 * дёргает уже этот роут на нашем же домене.
 */
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  if (ip === "unknown") {
    // Не смогли определить IP — не блокируем сайт из-за собственной неспособности его определить.
    return NextResponse.json<VpnCheckResult>({ blocked: false });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

  try {
    const key = process.env.PROXYCHECK_API_KEY;
    const url = `https://proxycheck.io/v2/${ip}?vpn=1&asn=1&risk=1${key ? `&key=${key}` : ""}`;
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) return NextResponse.json<VpnCheckResult>({ blocked: false });

    const data = await res.json();
    if (data?.status !== "ok") return NextResponse.json<VpnCheckResult>({ blocked: false });

    const info = data[ip];
    const isProxy = info?.proxy === "yes";
    const highRisk = typeof info?.risk === "number" && info.risk >= 66;

    return NextResponse.json<VpnCheckResult>({ blocked: Boolean(isProxy || highRisk) });
  } catch (err) {
    console.error("vpn-check error:", err);
    // Сбой стороннего API (таймаут, недоступность и т.п.) — не блокируем сайт из-за этого.
    return NextResponse.json<VpnCheckResult>({ blocked: false });
  } finally {
    clearTimeout(timer);
  }
}
