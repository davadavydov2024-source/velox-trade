import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SECURITY_HEADERS } from "@/lib/securityHeaders";

export function middleware(_req: NextRequest) {
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
