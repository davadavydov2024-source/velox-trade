import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { t } from "../fakes/store";
import { POST as checkout } from "@/app/api/orders/checkout/route";

const req = (body: any, tok = "tok:buyer") => new NextRequest("http://x/api/orders/checkout", { method: "POST", headers: { authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { t.reset();
  t.seed("users", "buyer", { balance: 100, displayName: "Buyer" });
  t.seed("users", "seller", { balance: 0 });
  t.seed("products", "p1", { name: "Item", price: 50, stock: 10, sellerId: "seller", gameId: "g" });
  t.seed("products", "free", { name: "Free", price: 0, stock: 10, sellerId: "seller", gameId: "g" });
});
describe("item 4: server rejects zero/negative amounts", () => {
  for (const q of [-5, 0, 1.5, "abc", null, 1e9]) {
    it(`quantity=${JSON.stringify(q)} rejected, balance & stock untouched`, async () => {
      const r = await checkout(req({ lines: [{ productId: "p1", quantity: q }] }));
      expect(r.status).toBe(400);
      expect(t.get("users", "buyer").balance).toBe(100);
      expect(t.get("products", "p1").stock).toBe(10);
    });
  }
  it("zero-price product (total 0) rejected", async () => {
    const r = await checkout(req({ lines: [{ productId: "free", quantity: 1 }] }));
    expect(r.status).toBe(400);
  });
  it("same product twice with negative second line cannot cancel the charge", async () => {
    const r = await checkout(req({ lines: [{ productId: "p1", quantity: 2 }, { productId: "p1", quantity: -1 }] }));
    expect(r.status).toBe(400);
  });
  it("valid purchase still works", async () => {
    const r = await checkout(req({ lines: [{ productId: "p1", quantity: 2 }] }));
    expect(r.status).toBe(200);
    expect(t.get("users", "buyer").balance).toBe(0);
    expect(t.get("products", "p1").stock).toBe(8);
  });
});
