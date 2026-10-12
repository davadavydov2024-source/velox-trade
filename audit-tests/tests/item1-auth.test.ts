import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { t, out } from "../fakes/store";
import { POST as ntg } from "@/app/api/notify/telegram/route";
import { POST as npush } from "@/app/api/notify/push/route";
import { POST as nemail } from "@/app/api/notify/email/route";
import { POST as nadmin } from "@/app/api/notify/admin/route";
import { POST as ndisp } from "@/app/api/admin/notify-dispute/route";
import { POST as nsell } from "@/app/api/admin/notify-sell-request/route";
import { POST as ncheckout } from "@/app/api/orders/checkout/route";
import { POST as npay } from "@/app/api/payments/create/route";
const SRC = process.env.SRC_DIR ?? "/home/claude/fresh3/src";
const routes: [string, any, any][] = [["notify/telegram", ntg, { uid: "v", text: "spam" }], ["notify/push", npush, { uid: "v", title: "x" }], ["notify/email", nemail, { uid: "v", subject: "s", html: "h" }], ["notify/admin", nadmin, { text: "x" }], ["admin/notify-dispute", ndisp, { orderId: "1" }], ["admin/notify-sell-request", nsell, {}], ["orders/checkout", ncheckout, { lines: [] }], ["payments/create", npay, { amount: 100 }]];
beforeEach(() => { t.reset(); out.tg.length = 0; out.push.length = 0; out.mail.length = 0; t.seed("telegramLinks", "v", { chatId: 5 }); t.seed("users", "v", { email: "v@x" }); });
describe("item 1: state-changing routes require credentials (no cookie sessions => classic CSRF token N/A)", () => {
  for (const [name, h, body] of routes) {
    it(`${name}: no Authorization -> 401, nothing sent`, async () => {
      const r = await h(new NextRequest("http://x/api/" + name, { method: "POST", headers: { cookie: "session=anything" }, body: JSON.stringify(body) }));
      expect(r.status).toBe(401); expect(out.tg.length + out.push.length + out.mail.length).toBe(0);
    });
    it(`${name}: forged token -> 401`, async () => {
      const r = await h(new NextRequest("http://x/api/" + name, { method: "POST", headers: { authorization: "Bearer forged" }, body: JSON.stringify(body) }));
      expect(r.status).toBe(401);
    });
  }
  it("authenticated notify/telegram works", async () => {
    const r = await ntg(new NextRequest("http://x", { method: "POST", headers: { authorization: "Bearer tok:u" }, body: JSON.stringify({ uid: "v", text: "hi" }) }));
    expect(r.status).toBe(200); expect(out.tg.length).toBe(1);
  });
  it("static scan: no route.ts reads cookies for auth (so a cross-site form cannot ride a session)", () => {
    const bad: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f === "route.ts" && /cookies\(\)|req\.cookies|request\.cookies/.test(readFileSync(p, "utf8"))) bad.push(p); } };
    walk(join(SRC, "app/api")); console.log("routes using cookies:", bad); expect(bad).toEqual([]);
  });
});
