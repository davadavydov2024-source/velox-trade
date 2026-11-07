import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SECURITY_HEADERS } from "@/lib/securityHeaders";

export function middleware(req: NextRequest) {
  // Главная (/) открывает MiliGram, адрес в браузере остаётся «/». Маркетплейс живёт на /veloxtrade.
  let res: NextResponse;
  if (req.nextUrl.pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/welcome";
    res = NextResponse.rewrite(url);
  } else {
    res = NextResponse.next();
  }
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
