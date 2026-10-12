import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { t } from "../fakes/store";
import { POST as create } from "@/app/api/payments/create/route";
import { POST as invoice } from "@/app/api/telegram/stars/invoice/route";
const mk = (url: string, body: string) => new NextRequest("http://x" + url, { method: "POST", headers: { authorization: "Bearer tok:u1" }, body });
beforeEach(() => { t.reset(); (globalThis as any).__pay = undefined; (globalThis as any).__inv = undefined;
  t.seed("users", "u1", { displayName: "U", badges: ["checkmark_blue"] }); t.seed("users", "s1", { badges: ["checkmark_blue"] });
  t.seed("telegramLinks", "u1", { chatId: 1 });
  t.seed("products", "p", { name: "N", stock: 5, sellerId: "s1", starsPrice: 20 }); });
describe("item 4: top-up amounts", () => {
  for (const a of ["0", "-100", "\"Infinity\"", "1e308", "\"abc\"", "null", "{}", "[]", "50.123", "999999999"]) {
    it(`amount=${a} rejected, no payment created`, async () => {
      const r = await create(mk("/api/payments/create", `{"amount":${a}}`));
      expect(r.status).toBe(400); expect((globalThis as any).__pay).toBeUndefined();
    });
  }
  it("valid 100 accepted", async () => { expect((await create(mk("/api/payments/create", `{"amount":100}`))).status).toBe(200); });
});
describe("item 4: Stars invoice quantity", () => {
  for (const q of ["0", "-3", "\"abc\"", "2.5", "1000"]) {
    it(`quantity=${q} rejected`, async () => {
      const r = await invoice(mk("/api/telegram/stars/invoice", `{"productId":"p","quantity":${q}}`));
      expect(r.status).toBe(400); expect((globalThis as any).__inv).toBeUndefined();
    });
  }
});
