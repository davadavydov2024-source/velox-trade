import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
const get = (path: string) => middleware(new NextRequest("https://velox-trade-zeta.vercel.app" + path));
describe("item 2: security headers on server responses", () => {
  for (const path of ["/", "/api/orders/checkout", "/profile/topup"]) {
    it(`${path}`, () => {
      const h = get(path).headers;
      console.log(path, "=>", { csp: h.get("content-security-policy"), hsts: h.get("strict-transport-security"), xfo: h.get("x-frame-options") });
      expect(h.get("content-security-policy")).toContain("frame-ancestors 'none'");
      expect(h.get("strict-transport-security")).toMatch(/max-age=\d{7,}/);
      expect(h.get("x-frame-options")).toBe("DENY");
      expect(h.get("x-content-type-options")).toBe("nosniff");
    });
  }
});
